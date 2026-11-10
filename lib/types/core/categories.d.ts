import type { Precision, TokenCoordinate } from './types.js';
export interface CategoryDef {
    id: number;
    key: string;
    label: string;
    group: 'input' | 'cache' | 'output' | 'reasoning';
    match: (c: TokenCoordinate) => boolean;
    origin: string;
    basePrecision: Precision;
}
export declare const CATEGORIES: CategoryDef[];
export declare const CATEGORY_BY_ID: Map<number, CategoryDef>;
export declare const CATEGORY_GROUPS: Array<{
    group: CategoryDef['group'];
    label: string;
    ids: number[];
}>;
