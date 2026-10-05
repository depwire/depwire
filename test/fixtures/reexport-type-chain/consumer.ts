import type { Shape } from './first';
import { area } from './first';

export function use(shape: Shape): number { return area(shape); }
