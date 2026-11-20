'use strict';

const swiggy = require('./swiggy');
const zomato = require('./zomato');

const ADAPTERS = Object.freeze({ swiggy, zomato });

const getAdapter = (platform) => ADAPTERS[String(platform || '').toLowerCase()] || null;

module.exports = { ADAPTERS, getAdapter };
