// TypeScript API client
export interface APIConfig {
  baseURL: string;
  timeout: number;
}

export const defaultConfig: APIConfig = {
  baseURL: 'http://localhost:3000',
  timeout: 30000
};
