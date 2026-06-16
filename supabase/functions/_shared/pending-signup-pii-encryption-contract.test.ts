import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_PATH = new URL(
  "../../migrations/20260613160000_pending_signup_intents_protected_pii.sql",
  import.meta.url,
);
const LEGACY_PII_NULLABILITY_MIGRATION_PATH = new URL(
  "../../migrations/20260616120000_pending_signup_intents_nullable_legacy_pii.sql",
  import.meta.url,
);
const CREATE_SUBSCRIPTION_PATH = new URL(
  "../create-subscription/index.ts",
  import.meta.url,
);

const PLAINTEXT_PENDING_SIGNUP_COLUMNS = [
  "email",
  "first_name",
  "last_name",
  "business_name",
  "phone",
];

const REQUIRED_PROTECTED_FIELDS = [
  "email",
  "first_name",
  "last_name",
  "business_name",
  "phone",
];

function extractAdditiveMigrationBlock(source: string): string {
  const match = source.match(
    /ALTER TABLE public\.pending_signup_intents[\s\S]*?;/,
  );
  assert(match, "pending_signup_intents additive ALTER TABLE block must exist");
  return match[0];
}

function extractTypeBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert(start >= 0, `Missing marker: ${marker}`);
  const end = source.indexOf("};", start);
  assert(end > start, `Missing end of block for marker: ${marker}`);
  return source.slice(start, end + 2);
}

function extractIntentPayloadBlock(source: string): string {
  const start = source.indexOf("const intentPayload = {");
  assert(start >= 0, "create-subscription must build an intentPayload");
  const end = source.indexOf("expires_at:", start);
  assert(
    end > start,
    "intentPayload must include expires_at after protected data",
  );
  return source.slice(start, end);
}

Deno.test("pending_signup_intents forward migration adds encrypted ciphertext plus HMAC lookup fields without rewriting history", async () => {
  const migration = await Deno.readTextFile(MIGRATION_PATH);
  const migrationBlock = extractAdditiveMigrationBlock(migration);

  for (const field of REQUIRED_PROTECTED_FIELDS) {
    assertStringIncludes(migrationBlock, `${field}_encrypted`);
    assertStringIncludes(migrationBlock, `${field}_hmac`);
  }

  for (const plaintextColumn of PLAINTEXT_PENDING_SIGNUP_COLUMNS) {
    const plaintextColumnPattern = new RegExp(
      `\\n\\s+${plaintextColumn}\\s+(?:text|varchar|citext|jsonb|uuid|bytea)\\b`,
      "i",
    );
    assertEquals(
      plaintextColumnPattern.test(migrationBlock),
      false,
      `protected PII migration must not add plaintext PII column '${plaintextColumn}'`,
    );
  }

  assertMatch(migrationBlock, /email_hmac\s+text/i);
  assertMatch(
    migration,
    /UNIQUE INDEX IF NOT EXISTS pending_signup_intents_email_hmac_unique_idx[\s\S]*email_hmac/i,
  );
});

Deno.test("pending_signup_intents schema allows encrypted/HMAC-only paid signup records without legacy plaintext PII", async () => {
  const initialMigration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260610120000_pending_signup_intents.sql",
      import.meta.url,
    ),
  );
  const protectedPiiMigration = await Deno.readTextFile(MIGRATION_PATH);
  const legacyPiiNullabilityMigration = await Deno.readTextFile(
    LEGACY_PII_NULLABILITY_MIGRATION_PATH,
  );
  const combinedSchemaContract =
    `${initialMigration}\n${protectedPiiMigration}\n${legacyPiiNullabilityMigration}`;

  for (const plaintextColumn of PLAINTEXT_PENDING_SIGNUP_COLUMNS) {
    assertEquals(
      new RegExp(
        `ALTER\\s+COLUMN\\s+${plaintextColumn}\\s+DROP\\s+NOT\\s+NULL`,
        "i",
      )
        .test(combinedSchemaContract) ||
        !new RegExp(`\\b${plaintextColumn}\\s+text\\s+NOT\\s+NULL`, "i").test(
          initialMigration,
        ),
      true,
      `pending_signup_intents.${plaintextColumn} must be nullable/not required so writers can store only encrypted/HMAC PII`,
    );
  }

  assertEquals(
    /CHECK\s*\([\s\S]*(email|first_name|last_name|business_name|phone)\s+IS\s+NOT\s+NULL/i
      .test(combinedSchemaContract),
    false,
    "pending_signup_intents must not add plaintext PII presence checks",
  );
});

Deno.test("create-subscription pending signup payload/model accepts encrypted + HMAC PII fields and no password", async () => {
  const source = await Deno.readTextFile(CREATE_SUBSCRIPTION_PATH);
  const subscriptionRequestBlock = extractTypeBlock(
    source,
    "interface SubscriptionRequest",
  );
  const intentPayloadBlock = extractIntentPayloadBlock(source);

  for (const field of REQUIRED_PROTECTED_FIELDS) {
    assertStringIncludes(
      subscriptionRequestBlock,
      `${field}_encrypted?: string`,
    );
    assertStringIncludes(subscriptionRequestBlock, `${field}_hmac?: string`);
    assertStringIncludes(intentPayloadBlock, `${field}_encrypted:`);
    assertStringIncludes(intentPayloadBlock, `${field}_hmac:`);
  }

  for (
    const plaintextKey of [
      "email",
      "nombre",
      "apellido",
      "negocioNombre",
      "telefono",
    ]
  ) {
    assertEquals(
      new RegExp(`${plaintextKey}\\?:`).test(subscriptionRequestBlock),
      false,
      `SubscriptionRequest.pending_signup_intent must not accept plaintext '${plaintextKey}'`,
    );
    assertEquals(
      new RegExp(`\\b${plaintextKey}\\s*:`).test(intentPayloadBlock),
      false,
      `intentPayload must not persist plaintext '${plaintextKey}'`,
    );
  }

  assertEquals(
    /password|password_hash|hashed_password/i.test(subscriptionRequestBlock),
    false,
  );
  assertEquals(
    /password|password_hash|hashed_password/i.test(intentPayloadBlock),
    false,
  );
});

Deno.test("create-subscription inserts pending signup intents with protected PII only", async () => {
  const source = await Deno.readTextFile(CREATE_SUBSCRIPTION_PATH);
  const intentPayloadBlock = extractIntentPayloadBlock(source);
  const pendingSignupInsertCall = source.indexOf(".insert(intentPayload)");
  assert(
    pendingSignupInsertCall >= 0,
    "create-subscription must insert intentPayload",
  );
  const pendingSignupInsertStart = source.lastIndexOf(
    '.from("pending_signup_intents")',
    pendingSignupInsertCall,
  );
  assert(
    pendingSignupInsertStart >= 0,
    "create-subscription must write pending_signup_intents",
  );
  const pendingSignupInsertBlock = source.slice(
    pendingSignupInsertStart,
    source.indexOf(
      '.select("id, external_reference")',
      pendingSignupInsertStart,
    ),
  );

  assertStringIncludes(pendingSignupInsertBlock, ".insert(intentPayload)");
  assertStringIncludes(intentPayloadBlock, "email_encrypted:");
  assertStringIncludes(intentPayloadBlock, "email_hmac:");

  for (
    const plaintextKey of [
      "email",
      "first_name",
      "last_name",
      "business_name",
      "phone",
      "nombre",
      "apellido",
      "negocioNombre",
      "telefono",
      "password",
    ]
  ) {
    assertEquals(
      new RegExp(`\\b${plaintextKey}\\s*:`).test(intentPayloadBlock),
      false,
      `intentPayload must not send plaintext '${plaintextKey}' to pending_signup_intents`,
    );
  }
});
