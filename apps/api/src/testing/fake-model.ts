import { Types } from 'mongoose';

function clone<T>(value: T): T {
  if (value instanceof Types.ObjectId) return value;
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as any).map(([key, item]) => [key, clone(item)])) as T;
  return value;
}

function readPath(document: any, key: string): any {
  return key.split('.').reduce((current, part) => current?.[part], document);
}

function same(left: any, right: any): boolean {
  if (left instanceof Types.ObjectId || right instanceof Types.ObjectId) return String(left) === String(right);
  return left === right;
}

function matches(document: any, filter: any = {}): boolean {
  if (!filter || typeof filter !== 'object') return true;
  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$or') { if (!(condition as any[]).some((item) => matches(document, item))) return false; continue; }
    if (key === '$and') { if (!(condition as any[]).every((item) => matches(document, item))) return false; continue; }
    if (key.startsWith('$')) continue;
    const actual = readPath(document, key);
    if (condition instanceof RegExp) { if (!condition.test(String(actual ?? ''))) return false; continue; }
    if (condition && typeof condition === 'object' && !(condition instanceof Date) && !(condition instanceof Types.ObjectId) && !Array.isArray(condition)) {
      for (const [operator, expected] of Object.entries(condition as any)) {
        if (operator === '$ne' && same(actual, expected)) return false;
        if (operator === '$in' && !(expected as any[]).some((item) => same(actual, item))) return false;
        if (operator === '$exists' && Boolean(actual !== undefined) !== Boolean(expected)) return false;
        if (operator === '$gte' && !(actual >= (expected as any))) return false;
        if (operator === '$lte' && !(actual <= (expected as any))) return false;
        if (operator === '$regex') {
          const regex = new RegExp(String(expected), (condition as any).$options || '');
          if (!regex.test(String(actual ?? ''))) return false;
        }
      }
      continue;
    }
    if (Array.isArray(actual)) {
      if (!actual.some((item) => same(item, condition))) return false;
    } else if (!same(actual, condition)) return false;
  }
  return true;
}

class FakeDocument {
  [key: string]: any;
  constructor(private readonly __repo: FakeModel, data: any) { Object.assign(this, clone(data)); }
  set(key: string, value: any) { this[key] = value; }
  toObject() { const result: any = {}; for (const [key, value] of Object.entries(this)) if (key !== '__repo') result[key] = clone(value); return result; }
  async save() { this.__repo.persist(this.toObject()); return this; }
}

class FakeQuery<T = any> implements PromiseLike<T> {
  private sortSpec?: Record<string, 1 | -1>;
  private offset = 0;
  private max?: number;
  private leanResult = false;
  constructor(private readonly resolveValue: () => any, private readonly model: FakeModel) {}
  select(_fields: string) { return this; }
  sort(value: Record<string, 1 | -1>) { this.sortSpec = value; return this; }
  skip(value: number) { this.offset = value; return this; }
  limit(value: number) { this.max = value; return this; }
  lean() { this.leanResult = true; return this; }
  async exec(): Promise<T> {
    let value = this.resolveValue();
    if (Array.isArray(value)) {
      if (this.sortSpec) {
        const [field, order] = Object.entries(this.sortSpec)[0];
        value = [...value].sort((a, b) => {
          const left = readPath(a, field); const right = readPath(b, field);
          return (left > right ? 1 : left < right ? -1 : 0) * order;
        });
      }
      value = value.slice(this.offset, this.max === undefined ? undefined : this.offset + this.max);
      return value.map((item) => this.leanResult ? clone(item) : this.model.document(item)) as T;
    }
    if (value === null || value === undefined) return value as T;
    return (this.leanResult ? clone(value) : this.model.document(value)) as T;
  }
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export class FakeModel {
  readonly rows: any[] = [];
  constructor(initial: any[] = []) { initial.forEach((row) => this.persist(row)); }
  document(data: any) { return new FakeDocument(this, data); }
  persist(data: any) {
    const row = clone(data);
    row._id ||= new Types.ObjectId();
    row.createdAt ||= new Date();
    row.updatedAt = new Date();
    const index = this.rows.findIndex((item) => same(item._id, row._id));
    if (index >= 0) this.rows[index] = row;
    else this.rows.push(row);
    return row;
  }
  create(data: any) {
    const row = this.persist({ ...data, _id: data._id || new Types.ObjectId() });
    return Promise.resolve(this.document(row));
  }
  find(filter: any = {}) { return new FakeQuery(() => this.rows.filter((row) => matches(row, filter)), this); }
  findOne(filter: any = {}) { return new FakeQuery(() => this.rows.find((row) => matches(row, filter)) || null, this); }
  findById(id: any) { return new FakeQuery(() => this.rows.find((row) => same(row._id, id)) || null, this); }
  findOneAndUpdate(filter: any, update: any, options: any = {}) {
    return new FakeQuery(() => {
      let row = this.rows.find((candidate) => matches(candidate, filter));
      if (!row && options.upsert) row = this.applyUpdate(this.equalities(filter), update, true);
      else if (row) row = this.applyUpdate(row, update, false);
      return row ? clone(row) : null;
    }, this);
  }
  async updateOne(filter: any, update: any, options: any = {}) {
    const row = this.rows.find((candidate) => matches(candidate, filter));
    if (row) this.applyUpdate(row, update, false);
    else if (options.upsert) this.applyUpdate(this.equalities(filter), update, true);
    return { acknowledged: true, modifiedCount: row ? 1 : 0, upsertedCount: row ? 0 : Number(Boolean(options.upsert)) };
  }
  async deleteOne(filter: any) {
    const index = this.rows.findIndex((row) => matches(row, filter));
    if (index >= 0) this.rows.splice(index, 1);
    return { deletedCount: Number(index >= 0) };
  }
  async deleteMany(filter: any) {
    const oldSize = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i--) if (matches(this.rows[i], filter)) this.rows.splice(i, 1);
    return { deletedCount: oldSize - this.rows.length };
  }
  async countDocuments(filter: any = {}) { return this.rows.filter((row) => matches(row, filter)).length; }
  async distinct(field: string, filter: any = {}) {
    return Array.from(new Set(this.rows.filter((row) => matches(row, filter)).map((row) => readPath(row, field))));
  }
  async exists(filter: any) { return this.rows.some((row) => matches(row, filter)) ? { _id: 1 } : null; }
  async aggregate(pipeline: any[]) {
    let output = [...this.rows];
    for (const step of pipeline) {
      if (step.$match) output = output.filter((row) => matches(row, step.$match));
      if (step.$group) {
        const key = step.$group._id.slice(1);
        const grouped = new Map<string, any>();
        for (const row of output) {
          const value = readPath(row, key);
          const current = grouped.get(value) || { _id: value, count: 0 };
          current.count += 1; grouped.set(value, current);
        }
        output = Array.from(grouped.values());
      }
      if (step.$sort) {
        const [key, order] = Object.entries(step.$sort)[0] as [string, number];
        output.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * order);
      }
      if (step.$limit) output = output.slice(0, step.$limit);
    }
    return output;
  }
  private equalities(filter: any) {
    return Object.fromEntries(Object.entries(filter).filter(([key, value]) => !key.startsWith('$') && (!value || typeof value !== 'object' || value instanceof Types.ObjectId)));
  }
  private applyUpdate(target: any, update: any, inserting: boolean) {
    const row = clone(target);
    if (inserting) Object.assign(row, this.equalities(target));
    for (const [key, value] of Object.entries(update.$setOnInsert || {})) if (inserting && row[key] === undefined) row[key] = clone(value);
    for (const [key, value] of Object.entries(update.$set || {})) row[key] = clone(value);
    for (const [key, value] of Object.entries(update.$max || {})) row[key] = Math.max(Number(row[key] || 0), Number(value));
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = Number(row[key] || 0) + Number(value);
    for (const key of Object.keys(update.$unset || {})) delete row[key];
    this.persist(row);
    return row;
  }
}
