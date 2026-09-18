import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { z } from "zod";
import type { TestResponse } from "./support.js";

const SPEC_FILE = new URL("../openapi.yaml", import.meta.url);
const SCHEMA_BASE = "https://contract.invalid/schemas/";
const SCHEMA_REF = "#/components/schemas/";
const RESPONSE_REF = "#/components/responses/";
const JSON_MEDIA_TYPE = "application/json";
const MAX_REPORTED_ERRORS = 5;
const MAX_REPORTED_BODY_CHARS = 2000;
export const HTTP_METHODS = ["get", "put", "post", "delete", "patch"] as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const json: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(json),
    z.record(json),
  ]),
);

const responseObject = z.object({
  description: z.string(),
  content: z.record(z.object({ schema: json })).optional(),
});
const responseEntry = z.union([
  z.object({ $ref: z.string().startsWith(RESPONSE_REF) }),
  responseObject,
]);
const operationObject = z.object({
  operationId: z.string(),
  security: z.array(z.record(z.array(z.string()))).optional(),
  responses: z.record(responseEntry),
});
const specSchema = z.object({
  openapi: z.string().startsWith("3.1"),
  paths: z.record(z.record(z.unknown())),
  components: z.object({
    schemas: z.record(json),
    responses: z.record(responseObject),
  }),
});

type ResponseObject = z.infer<typeof responseObject>;

export interface Operation {
  readonly key: string;
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly requiresSession: boolean;
  readonly statuses: readonly string[];
}

// Component refs become absolute ids so each component can be registered with
// ajv on its own and resolved in strict mode.
function withAbsoluteRefs(value: Json): Json {
  if (Array.isArray(value)) return value.map(withAbsoluteRefs);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "$ref" &&
      typeof entry === "string" &&
      entry.startsWith(SCHEMA_REF)
        ? SCHEMA_BASE + entry.slice(SCHEMA_REF.length)
        : withAbsoluteRefs(entry),
    ]),
  );
}

export function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/** The OpenAPI document compiled into response validators, with coverage tracking. */
export class Contract {
  readonly operations: readonly Operation[];
  private readonly validators = new Map<string, ValidateFunction | null>();
  private readonly exercised = new Set<string>();

  constructor(file: URL = SPEC_FILE) {
    const spec = specSchema.parse(parse(readFileSync(file, "utf8")));
    // strictRequired is off because allOf branches and `not` clauses require
    // properties that the base schema defines; all other strict checks apply.
    const ajv = new Ajv2020({
      strict: true,
      strictRequired: false,
      allErrors: true,
    });
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      const component = withAbsoluteRefs(schema);
      assert.ok(
        component !== null &&
          typeof component === "object" &&
          !Array.isArray(component),
        `schema ${name} must be an object`,
      );
      ajv.addSchema({ ...component, $id: SCHEMA_BASE + name });
    }
    const operations: Operation[] = [];
    for (const [path, item] of Object.entries(spec.paths))
      for (const method of HTTP_METHODS) {
        if (item[method] === undefined) continue;
        const operation = operationObject.parse(item[method]);
        const key = operationKey(method, path);
        for (const [status, entry] of Object.entries(operation.responses)) {
          const response: ResponseObject =
            "$ref" in entry
              ? this.resolveResponse(spec.components.responses, entry.$ref)
              : entry;
          const schema = response.content?.[JSON_MEDIA_TYPE]?.schema;
          this.validators.set(
            `${key} ${status}`,
            schema === undefined
              ? null
              : ajv.compile(withAbsoluteRefs(schema) as object),
          );
        }
        operations.push({
          key,
          method: method.toUpperCase(),
          path,
          operationId: operation.operationId,
          requiresSession: operation.security?.length !== 0,
          statuses: Object.keys(operation.responses),
        });
      }
    this.operations = operations;
  }

  private resolveResponse(
    responses: Record<string, ResponseObject>,
    ref: string,
  ): ResponseObject {
    const name = ref.slice(RESPONSE_REF.length);
    if (!Object.hasOwn(responses, name))
      assert.fail(`unresolved response ${ref}`);
    return responses[name];
  }

  /**
   * Asserts that `response` matches the documented response for `operation`
   * (for example "POST /api/student/questions") and records it as exercised.
   * Returns the body for further assertions.
   */
  check(operation: string, response: TestResponse): unknown {
    const id = `${operation} ${String(response.status)}`;
    const validate = this.validators.get(id);
    if (validate === undefined)
      assert.fail(
        `undocumented response ${id}: ${JSON.stringify(response.body)}`,
      );
    if (validate !== null && !validate(response.body))
      assert.fail(
        `${id} does not match the contract: ${JSON.stringify(validate.errors?.slice(0, MAX_REPORTED_ERRORS))}\nbody: ${JSON.stringify(response.body).slice(0, MAX_REPORTED_BODY_CHARS)}`,
      );
    this.exercised.add(id);
    return response.body;
  }

  /** Documented responses that no test has exercised yet. */
  unexercised(): string[] {
    return [...this.validators.keys()].filter((id) => !this.exercised.has(id));
  }
}

/** Reads a string field from a validated response body. */
export function stringField(body: unknown, key: string): string {
  if (body === null || typeof body !== "object")
    assert.fail(`expected an object with ${key}`);
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string") assert.fail(`expected string field ${key}`);
  return value;
}
