/**
 * @module SlimRunner
 */

/*
 * japa
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

import ow from 'ow'
import chalk from 'chalk'
import { Runner } from '../Runner'
import { Group } from '../Group'
import { Test } from '../Test'
import { Assert } from '../Assert'
import listReporter from '../Reporter/list'
import { ICallback, IOptions, ITestOptions, IConfigureOptions } from '../Contracts'
import { Loader } from './Loader'
import { emitter } from '../Emitter'
import { EventEmitter } from 'events'

const loader = new Loader()

/**
 * The type for the arguments to be passed to a
 * test
 */
type testArgs = [Assert, Function]

/**
 * The type for the arguments to be passed to a
 * hook
 */
type hookArgs = [Function]

/**
 * Group instance exposed by slim runner
 */
type runnerGroup = Pick<Group<testArgs, hookArgs>, Exclude<keyof Group<testArgs, hookArgs>, 'run' | 'toJSON' | 'test'>>

/**
 * Test instance exposed by slim runner
 */
type runnerTest = Pick<Test<testArgs>, Exclude<keyof Test<testArgs>, 'run' | 'toJSON'>>

/**
 * Returns arguments to be passed to the callback
 * of a test
 */
function testArgsFn (done: Function, postRun: Function): testArgs {
  postRun(function postRunFn (assert) {
    assert.evaluate()
  })
  return [new Assert(), done]
}

/**
 * Returns arguments to be passed to the callback of
 * a hook
 */
function hookArgsFn (done: Function): hookArgs {
  return [done]
}

/**
 * Store of groups
 */
let groups: Group<testArgs, hookArgs>[] = []

/**
 * The active group, in which all tests must be scoped
 */
let activeGroup: Group<testArgs, hookArgs> | null = null

/**
 * Options for the test runner
 */
let runnerOptions: IOptions = {
  bail: false,
  timeout: 2000,
}

/**
 * Custom reporter function
 */
let reporterFn: ((emitter: EventEmitter) => void) = listReporter

/**
 * Reference to runner hooks, to be defined inside configure
 * method
 */
let beforeHooks: ((runner: Runner<testArgs, hookArgs>, emitter: EventEmitter) => Promise<void>)[] = []
let afterHooks: ((runner: Runner<testArgs, hookArgs>, emitter: EventEmitter) => Promise<void>)[] = []

/**
 * Adds the test to the active group. If there isn't any active
 * group, it will be created.
 */
function addTest (title: string, callback: ICallback<testArgs>, options?: Partial<ITestOptions>): runnerTest {
  if (!activeGroup) {
    activeGroup = new Group('root', testArgsFn, hookArgsFn, runnerOptions)
    groups.push(activeGroup)
  }

  return activeGroup.test(title, callback, options)
}

/**
 * Create a new test
 */
export function test (title: string, callback: ICallback<testArgs>) {
  return addTest(title, callback)
}

/**
 * Run all the tests using the runner
 */
export async function run (exitProcess = true) {
  const runner = new Runner(groups, runnerOptions)
  runner.reporter(reporterFn)

  /**
   * Execute before hooks before loading any files
   * from the disk
   */
  for (let hook of beforeHooks) {
    await hook(runner, emitter)
  }

  const loaderFiles = await loader.loadFiles()
  if (loaderFiles.length && groups.length) {
    console.log(chalk.bgRed('Calling configure inside test file is not allowed. Create a master file for same'))
    process.exit(1)
  }

  /**
   * Load all files from the loader
   */
  loaderFiles.forEach((file) => require(file))
  let hardException = null

  try {
    await runner.run()
  } catch (error) {
    hardException = error
  }

  /**
   * Executing after hooks before cleanup
   */
  for (let hook of afterHooks) {
    await hook(runner, emitter)
  }

  if (exitProcess) {
    runner.hasErrors || hardException ? process.exit(1) : process.exit(0)
  }

  groups = []
  activeGroup = null
}

export namespace test {
  /**
   * Create a new test to group all test together
   */
  export function group (title: string, callback: (group: runnerGroup) => void) {
    activeGroup = new Group(title, testArgsFn, hookArgsFn, runnerOptions)
    groups.push(activeGroup)

    /**
     * Pass instance of the group to the callback. This enables defining lifecycle
     * hooks
     */
    callback(activeGroup)

    /**
     * Reset group after callback has been executed
     */
    activeGroup = null
  }

  /**
   * Create a test, and mark it as skipped. Skipped functions are
   * never executed. However, their hooks are executed
   */
  export function skip (title: string, callback: ICallback<testArgs>) {
    return addTest(title, callback, { skip: true })
  }

  /**
   * Create a test, and mark it as skipped only when running in CI. Skipped
   * functions are never executed. However, their hooks are executed.
   */
  export function skipInCI (title: string, callback: ICallback<testArgs>) {
    return addTest(title, callback, { skipInCI: true })
  }

  /**
   * Create a test and run it only in the CI.
   */
  export function runInCI (title: string, callback: ICallback<testArgs>) {
    return addTest(title, callback, { runInCI: true })
  }

  /**
   * Create regression test
   */
  export function failing (title: string, callback: ICallback<testArgs>) {
    return addTest(title, callback, { regression: true })
  }

  /**
   * Configure test runner
   */
  export function configure (options: Partial<IConfigureOptions>) {
    if (groups.length) {
      throw new Error('test.configure must be called before creating any tests')
    }

    /**
     * Hold repoter fn to be passed to the runner
     */
    if (options.reporterFn) {
      reporterFn = options.reporterFn
    }

    /**
     * Use bail option if defined by the end user
     */
    if (options.bail !== undefined) {
      runnerOptions.bail = options.bail
    }

    /**
     * Use timeout if defined by the end user
     */
    if (typeof (options.timeout) === 'number') {
      runnerOptions.timeout = options.timeout
    }

    /**
     * Use files glob if defined
     */
    if (options.files !== undefined) {
      loader.files(options.files)
    }

    /**
     * Use files filter if defined as function
     */
    if (typeof (options.filter) === 'function') {
      loader.filter(options.filter)
    }

    /**
     * Set after hooks
     */
    if (options.before) {
      ow(options.before, 'configure.before', ow.array)
      beforeHooks = options.before
    }

    /**
     * Set before hooks
     */
    if (options.after) {
      ow(options.after, 'configure.after', ow.array)
      afterHooks = options.after
    }

    /**
     * If grep is defined, then normalize it to regex
     */
    if (options.grep) {
      runnerOptions.grep = options.grep instanceof RegExp ? options.grep : new RegExp(options.grep)
    }
  }
}
