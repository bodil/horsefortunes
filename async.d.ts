declare module "async" {
  export function each<T>(array: T[], iterator: (item: T, cb: Function) => void, callback: (err) => void);
}
