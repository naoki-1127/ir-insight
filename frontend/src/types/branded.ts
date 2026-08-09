// types/branded.ts
declare const brand: unique symbol;

type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type CompanyId = Brand<string, "CompanyId">;
export type DocumentId = Brand<string, "DocumentId">;
