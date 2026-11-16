declare module "*.sql?raw" {
  const value: string;
  export default value;
}

declare module "*.csv?raw" {
  const value: string;
  export default value;
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
