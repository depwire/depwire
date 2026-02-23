// JavaScript API wrapper
const { defaultConfig } = require('./api-config');

class APIClient {
  constructor(config = defaultConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout;
  }

  async request(endpoint) {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url);
    return response.json();
  }
}

module.exports = { APIClient };
