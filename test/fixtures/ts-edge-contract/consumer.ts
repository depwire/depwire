import { Client } from './barrel.js';
import { missing } from './empty.js';

@Client()
export class Example {}

export function run() {
  missing();
}
