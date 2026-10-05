export const a = 1;
export interface A { value: number }
export default function defaultValue() { return a; }
console.log('re-export target evaluated');
