const billing = require('./billing');
const orders = require('./orders');
const ops = require('./ops');
const theme = require('./theme');
const print = require('./print');
const reports = require('./reports');

module.exports = {
  ...billing,
  ...orders,
  ...ops,
  ...theme,
  ...print,
  ...reports,
};
