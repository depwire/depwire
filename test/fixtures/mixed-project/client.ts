import { defaultConfig } from './config';

class ApiClient {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = defaultConfig.apiUrl;
  }
  
  async fetchData(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/data`);
    return response.json();
  }
}

export { ApiClient };
