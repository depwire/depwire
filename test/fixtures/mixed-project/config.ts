export interface Config {
  apiUrl: string;
  timeout: number;
}

export const defaultConfig: Config = {
  apiUrl: 'http://localhost:8000',
  timeout: 30000
};
