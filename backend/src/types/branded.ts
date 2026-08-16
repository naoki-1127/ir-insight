declare const brand: unique symbol;
type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type CompanyId = Brand<string, "CompanyId">;
export type DocumentId = Brand<string, "DocumentId">;
export type FinancialId = Brand<string, "FinancialId">;

export const asCompanyId = (id: string): CompanyId => id as CompanyId;
export const asDocumentId = (id: string): DocumentId => id as DocumentId;
