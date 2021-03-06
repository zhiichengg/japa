'use strict'

/*
 * japa
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const chalk = require('chalk')
const rightPad = require('right-pad')
const variableDiff = require('variable-diff')
const ms = require('ms')
const fs = require('fs'); 
var parser = require('xml2json');

let count = 0;
let failCount = 0;
let testSuitesDuration = 0;
let testSuiteDuration =0;


class Min {
  testsStatuses: string[]
  activeGroup: any
  start: any
  testCase: {}
  testSuite: any[]
  testSuites: any[]
  colors: { passed: string; failed: string; skipped: string; todo: string }
  finalStats: { total: number; passed: number; failed: number; skipped: number; regression: number; todo: number }
  icons: { passed: string; failed: string; skipped: string; todo: string }

  constructor (emitter: { on: (arg0: string, arg1: any) => void }) {
    this.testsStatuses = ['passed', 'failed', 'skipped', 'todo']
    this.activeGroup = null
    this.start = null
    this.testCase = {};
    this.testSuite = [];
    this.testSuites = [];

    /**
     * Colors to be used for tests.
     * @type {Object}
     */
    this.colors = {
      passed: 'green',
      failed: 'red',
      skipped: 'yellow',
      todo: 'cyan'
    }

    /**
     * Final stats containing each counts for
     * each test status.
     * @type {Object}
     */
    this.finalStats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      regression: 0,
      todo: 0
    }

    /**
     * Icons to be used for each test
     * status.
     * @type {Object}
     */
    this.icons = {
      passed: '✓',
      failed: '✖',
      skipped: '.',
      todo: '!'
    }

    emitter.on('test:end', this.onTestEnd.bind(this))
    emitter.on('group:start', this.onGroupStart.bind(this))
    emitter.on('group:end', this.onGroupEnd.bind(this))
    emitter.on('end', this.onTestsEnd.bind(this))
    emitter.on('start', this.onTestsStart.bind(this))
  }

  /**
   * Inspects error to tell whether their is a diff
   * or not.
   *
   * @param  {Object} error
   * @return {Boolean}
   */
  _hasDiff (error: { actual: any; expected: any }) {
    return typeof (error.actual) !== 'undefined' || typeof (error.expected) !== 'undefined'
  }

  /**
   * Returns the status color for a given status
   * @param  {String} status
   * @return {Function}
   */
  _getStatusColor (status: string | number) {
    return chalk[this.colors[status]] || chalk.gray
  }

  /**
   * Logs a line with 2 spaces in front
   *
   * @param  {String} line
   */
  log (line: string) {
    console.log(`  ${line}`)
  }

  /**
   * Emits a blank line to the console
   */
  blankLine () {
    console.log()
  }

  /**
   * Returns the icon for test status
   *
   * @param  {String} status
   * @return {Function}
   */
  _getStatusIcon (status: string | number) {
    return chalk[this.colors[status]](this.icons[status])
  }

  /**
   * Generates the final summary report for all
   * the tests.
   *
   * @param  {Number} end
   * @return {String}
   */
  generateReport (end: number) {
    let report = ''
    const statsKeys = Object.keys(this.finalStats)
    statsKeys.forEach((stat) => {
      if (this.finalStats[stat] > 0) {
        report += chalk.gray(`  ${rightPad(stat, 11)} : ${this.finalStats[stat]}\n`)
      }
    })
    report += chalk.gray(`  ${rightPad('time', 11)} : ${ms(end)}`)
  
      const testSuitesHeader = this.testSuites
      const result ={
          testsuites:{
            duration: testSuitesDuration,
            testsuite: testSuitesHeader
          }
      }

      var xml = parser.toXml(result);
      fs.appendFileSync('result.xml', xml); 


      return report

  }

  /**
   * Called whenever a given test fails. It will print
   * the test status to the console.
   *
   * @param  {String} options.status
   * @param  {String} options.title
   * @param  {Number} options.duration
   * @param  {Boolean} options.regression
   * @param  {String} options.regressionMessage
   */
  onTestEnd ({error, status, title, duration, regression, regressionMessage }) {
    if (this.testsStatuses.indexOf(status) <= -1) {
      return
    }

    this.finalStats[status]++
    this.finalStats.total++



    if (regression) {
      this.finalStats.regression++
    }

    const color = status === 'passed' ? chalk.gray : this._getStatusColor(status)
    const pad = this.activeGroup ? '  ' : ''
    this.log(`${pad}${this._getStatusIcon(status)} ${color(title)} ${chalk.gray(`(${ms(duration)})`)}`)

    if (regressionMessage) {
      this.log(`${pad}${pad}${chalk.magenta(`MESSAGE: ${regressionMessage}`)} \n`)
    }

    if(error!=null)
    {
      failCount++;
    }

    testSuiteDuration = testSuiteDuration + duration;
    
    const testCase = {
      classname:'',
      name:title,
      time: duration,
      // testError: error==null ? "No Error" : error.message
  }
  count++;
  
    this.testSuite.push(testCase);
  }

  /**
   * Called everytime a group starts. This method
   * will log the group name to the console.
   *
   * @param  {String} options.title
   */
  onGroupStart ({ title }) {
    this.activeGroup = title
    this.blankLine()
    this.log(chalk.white(title))

    this.testSuite = [];


  }

  /**
   * Called everytime a group ends. It will set the
   * active group to null.
   */
  onGroupEnd () {
    this.activeGroup = null


    const testSuite = {
      failures: failCount,
      name:'',
      package:'',
      test: count,
      time: testSuiteDuration,
      testcase: this.testSuite
    }

    this.testSuites.push(testSuite);
    testSuitesDuration = testSuitesDuration + testSuiteDuration;
    count = 0;
    failCount = 0;
    testSuiteDuration = 0;
  }

  /**
   * Prints error by showing the diff if available.
   *
   * @param  {Object} options.error
   * @param  {Number} index
   */
  printError ({ error, title }: any, index: number) {
    const hasDiff = this._hasDiff(error)
    const stack = hasDiff ? error.message : (error.stack ? error.stack : (error.message ? error.message : error))

    this.log(`${chalk.red(`${index + 1}.`)} ${chalk.red(title)}`)
    this.log(chalk.red(stack))

    if (hasDiff) {
      const result = variableDiff(error.actual, error.expected)
      result.text.split('\n').forEach(this.log)
    }
    this.blankLine()
  }

  /**
   * Prints the stack of errors to the console.
   *
   * @param  {Array|Object} errors
   */
  printStack (errors: any[]) {
    if (!errors) {
      return
    }

    this.blankLine()
    this.log(chalk.bgRed(' ERRORS '))
    this.blankLine()

    if (errors instanceof Array === true) {
      errors.forEach(this.printError.bind(this))
      return
    }

    this.printError(errors,5)
  }

  /**
   * Called when all the tests ends. This method will print
   * the final errors stack and the report for all the
   * statuses.
   *
   * @param  {String} options.status
   * @param  {Array} options.error
   */
  onTestsEnd ({status, error}) {

    const end = new Date().getDate() - this.start

    this.blankLine()

    /**
     * Show a small message with Zero tests ran when
     * total count of tests is zero
     *
     * @method if
     *
     * @param  {[type]} this.finalStats.total [description]
     *
     * @return {[type]}                       [description]
     */
    if (this.finalStats.total === 0) {
      this.log(chalk.bgMagenta.white(' 0 TESTS RAN '))
      return
    }

    this.printStack(error)

    if (status === 'passed') {
      this.log(chalk.bgGreen.white(' PASSED '))
    } else {
      this.log(chalk.bgRed.white(' FAILED '))
    }
    this.blankLine()
    console.log(this.generateReport(end))

    }

  /**
   * Called whenever the tests are started. We hold the
   * start time for the final time take calculation.
   */
  onTestsStart () {
  this.start = new Date().getDate()
    
  }
}

module.exports = (emitter: any) => new Min(emitter)
