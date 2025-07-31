// lambda.js
const serverless = require('serverless-http');
const app = require('./server'); // your existing Express app
module.exports.handler = serverless(app);
