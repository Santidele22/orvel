import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = resolve(
  process.cwd(),
  '../../supabase/migrations/_legacy/20260702110000_ensure_business_principal_branch_for_public_booking.sql'
);

const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf8');

type Business = {
  id: string;
  name: string | null;
  timezone: string | null;
};

type Branch = {
  businessId: string;
  name: string;
  slug: string | null;
  timezone: string | null;
  isActive: boolean;
};

type Store = {
  businesses: Business[];
  branches: Branch[];
};

function normalized(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

type PrincipalUpsert = (store: Store, candidate: Branch) => void;

type BranchInsertProjection = {
  branchFor: (business: Business) => Branch;
};

type MigrationContract = {
  branchInsertedByBusinessInsertTrigger: (business: Business) => Branch;
  runBranchlessBusinessBackfill: (store: Store) => void;
  applyBusinessInsertTrigger: (store: Store, business: Business) => void;
  applyBusinessTimezoneUpdateTrigger: (store: Store, businessId: string, timezone: string | null) => void;
  applyEveryPrincipalConflictUpdate: (store: Store, candidate: Branch) => void;
};

function requireSqlClause(name: string, match: RegExpMatchArray | null): string {
  if (!match?.[1]) {
    throw new Error(`Missing SQL clause: ${name}`);
  }

  return match[1];
}

function extractFunctionClause(sql: string, name: 'INSERT' | 'UPDATE'): string {
  if (name === 'INSERT') {
    return requireSqlClause(
      'businesses trigger INSERT branch',
      sql.match(/IF\s+TG_OP\s*=\s*'INSERT'\s+THEN([\s\S]*?)ELSIF\s+TG_OP\s*=\s*'UPDATE'\s+THEN/i)
    );
  }

  return requireSqlClause(
    'businesses trigger UPDATE branch',
    sql.match(/ELSIF\s+TG_OP\s*=\s*'UPDATE'\s+THEN([\s\S]*?)END IF;/i)
  );
}

function extractBackfillClause(sql: string): string {
  return requireSqlClause(
    'existing businesses backfill INSERT',
    sql.match(/EXECUTE FUNCTION public\.ensure_business_principal_branch\(\);\s*([\s\S]*?)COMMIT;/i)
  );
}

function splitTopLevelExpressions(valuesSql: string): string[] {
  const expressions: string[] = [];
  let start = 0;
  let depth = 0;
  let inString = false;

  for (let index = 0; index < valuesSql.length; index += 1) {
    const char = valuesSql[index];
    const next = valuesSql[index + 1];

    if (inString) {
      if (char === "'" && next === "'") {
        index += 1;
        continue;
      }

      if (char === "'") {
        inString = false;
      }

      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      continue;
    }

    if (char === ',' && depth === 0) {
      expressions.push(valuesSql.slice(start, index).trim());
      start = index + 1;
    }
  }

  expressions.push(valuesSql.slice(start).trim());

  return expressions;
}

function unquoteSqlString(value: string): string {
  const match = value.trim().match(/^'((?:''|[^'])*)'$/);

  if (!match) {
    throw new Error(`Unsupported SQL string literal: ${value}`);
  }

  return match[1].replaceAll("''", "'");
}

function evaluateBranchInsertExpression(expression: string, business: Business, sourceAlias: 'NEW' | 'b'): string | boolean | null {
  const source = sourceAlias === 'NEW' ? 'NEW' : 'b';
  const normalizedExpression = expression.replace(/\s+/g, ' ').trim();

  if (new RegExp(`^${source}\\.id$`, 'i').test(normalizedExpression)) {
    return business.id;
  }

  if (/^true$/i.test(normalizedExpression)) {
    return true;
  }

  if (/^false$/i.test(normalizedExpression)) {
    return false;
  }

  const stringLiteral = normalizedExpression.match(/^'((?:''|[^'])*)'$/);
  if (stringLiteral) {
    return unquoteSqlString(normalizedExpression);
  }

  const fallbackString = "'((?:''|[^'])*)'";
  const nullIfBtrimMatch = normalizedExpression.match(
    new RegExp(`^COALESCE\\(NULLIF\\(btrim\\(${source}\\.(name|timezone)\\), ''\\), ${fallbackString}\\)$`, 'i')
  );

  if (nullIfBtrimMatch) {
    const [, field] = nullIfBtrimMatch;
    const sourceValue = field.toLowerCase() === 'name' ? business.name : business.timezone;

    return normalized(sourceValue) ?? unquoteSqlString(`'${nullIfBtrimMatch[2]}'`);
  }

  throw new Error(`Unsupported branch INSERT expression: ${expression}`);
}

function branchInsertProjectionFromSql(insertSql: string, sourceAlias: 'NEW' | 'b'): BranchInsertProjection {
  const insertMatch = insertSql.match(
    /INSERT\s+INTO\s+public\.branches\s*\(([^)]*)\)\s*(?:VALUES\s*\((.*?)\)|SELECT\s+([\s\S]*?)\s+FROM\s+public\.businesses\s+b)\s*(?:ON\s+CONFLICT|WHERE\s+NOT\s+EXISTS)/is
  );

  if (!insertMatch) {
    throw new Error(`Missing public.branches INSERT projection for ${sourceAlias}`);
  }

  const columns = insertMatch[1].split(',').map((column) => column.trim());
  const expressionSql = insertMatch[2] ?? insertMatch[3];
  const expressions = splitTopLevelExpressions(expressionSql);

  if (columns.length !== expressions.length) {
    throw new Error(`Branch INSERT column/expression mismatch for ${sourceAlias}`);
  }

  const expressionByColumn = new Map(columns.map((column, index) => [column, expressions[index]]));

  return {
    branchFor(business) {
      return {
        businessId: evaluateBranchInsertExpression(
          requireSqlClause('business_id insert expression', expressionByColumn.get('business_id')?.match(/^([\s\S]+)$/) ?? null),
          business,
          sourceAlias
        ) as string,
        name: evaluateBranchInsertExpression(
          requireSqlClause('name insert expression', expressionByColumn.get('name')?.match(/^([\s\S]+)$/) ?? null),
          business,
          sourceAlias
        ) as string,
        slug: evaluateBranchInsertExpression(
          requireSqlClause('slug insert expression', expressionByColumn.get('slug')?.match(/^([\s\S]+)$/) ?? null),
          business,
          sourceAlias
        ) as string | null,
        timezone: evaluateBranchInsertExpression(
          requireSqlClause('timezone insert expression', expressionByColumn.get('timezone')?.match(/^([\s\S]+)$/) ?? null),
          business,
          sourceAlias
        ) as string | null,
        isActive: evaluateBranchInsertExpression(
          requireSqlClause('is_active insert expression', expressionByColumn.get('is_active')?.match(/^([\s\S]+)$/) ?? null),
          business,
          sourceAlias
        ) as boolean,
      };
    },
  };
}

function extractUpdateTargetSlug(updateSql: string): string | null {
  const match = updateSql.match(/\bslug\s*=\s*('(?:''|[^'])*')/i);

  return match ? unquoteSqlString(match[1]) : null;
}

function branchExistsPredicate(backfillSql: string): (store: Store, business: Business) => boolean {
  const notExistsSql = requireSqlClause(
    'backfill NOT EXISTS predicate',
    backfillSql.match(/WHERE\s+NOT\s+EXISTS\s*\(([\s\S]*?)\)\s*ON\s+CONFLICT/i)
  );
  const isScopedToBusiness = /br\.business_id\s*=\s*b\.id/i.test(notExistsSql);
  const onlyCountsActiveBranches = /br\.is_active\s*=\s*true|br\.is_active\s+IS\s+TRUE/i.test(notExistsSql);

  if (!isScopedToBusiness) {
    throw new Error('Backfill predicate is not scoped to the business branch rows');
  }

  return (store, business) =>
    store.branches.some(
      (branch) => branch.businessId === business.id && (!onlyCountsActiveBranches || branch.isActive)
    );
}

function principalUpsertFromSql(insertSql: string): PrincipalUpsert {
  const conflictUpdateSql = requireSqlClause(
    'principal branch ON CONFLICT update',
    insertSql.match(/ON\s+CONFLICT\s*\(business_id,\s*slug\)\s*WHERE\s+slug\s+IS\s+NOT\s+NULL\s+DO\s+UPDATE\s+SET([\s\S]*?);/i)
  );
  const updatesTimezoneFromExcluded = /timezone\s*=\s*COALESCE\s*\(\s*public\.branches\.timezone\s*,\s*EXCLUDED\.timezone\s*\)/i.test(
    conflictUpdateSql
  );
  const forcesActiveOnConflict = /is_active\s*=\s*true/i.test(conflictUpdateSql);

  return (store, candidate) => {
    const existing = store.branches.find(
      (branch) => branch.businessId === candidate.businessId && branch.slug === candidate.slug
    );

    if (!existing) {
      store.branches.push({ ...candidate });
      return;
    }

    if (updatesTimezoneFromExcluded) {
      existing.timezone = existing.timezone ?? candidate.timezone;
    }

    if (forcesActiveOnConflict) {
      existing.isActive = true;
    }
  };
}

function migrationContractFromSql(sql: string): MigrationContract {
  const insertTriggerSql = extractFunctionClause(sql, 'INSERT');
  const updateTriggerSql = extractFunctionClause(sql, 'UPDATE');
  const backfillSql = extractBackfillClause(sql);
  const backfillHasBranchForBusiness = branchExistsPredicate(backfillSql);
  const insertTriggerProjection = branchInsertProjectionFromSql(insertTriggerSql, 'NEW');
  const backfillProjection = branchInsertProjectionFromSql(backfillSql, 'b');
  const upsertFromInsertTrigger = principalUpsertFromSql(insertTriggerSql);
  const upsertFromBackfill = principalUpsertFromSql(backfillSql);
  const principalConflictUpserts = [upsertFromInsertTrigger, upsertFromBackfill];
  const updateTriggerCanInsertPrincipal = /INSERT\s+INTO\s+public\.branches/i.test(updateTriggerSql);
  const updateTriggerTargetSlug = extractUpdateTargetSlug(updateTriggerSql);

  return {
    branchInsertedByBusinessInsertTrigger(business) {
      return insertTriggerProjection.branchFor(business);
    },
    runBranchlessBusinessBackfill(store) {
      for (const business of store.businesses) {
        if (!backfillHasBranchForBusiness(store, business)) {
          upsertFromBackfill(store, backfillProjection.branchFor(business));
        }
      }
    },
    applyBusinessInsertTrigger(store, business) {
      store.businesses.push({ ...business });
      upsertFromInsertTrigger(store, insertTriggerProjection.branchFor(business));
    },
    applyBusinessTimezoneUpdateTrigger(store, businessId, timezone) {
      const business = store.businesses.find((candidate) => candidate.id === businessId);

      if (!business) {
        throw new Error(`Missing business ${businessId}`);
      }

      business.timezone = timezone;

      if (updateTriggerCanInsertPrincipal) {
        upsertFromInsertTrigger(store, insertTriggerProjection.branchFor(business));
        return;
      }

      if (!updateTriggerTargetSlug) {
        return;
      }

      const nextTimezone = insertTriggerProjection.branchFor(business).timezone;
      const principal = store.branches.find(
        (branch) => branch.businessId === businessId && branch.slug === updateTriggerTargetSlug
      );

      if (principal) {
        principal.timezone = principal.timezone ?? nextTimezone;
      }
    },
    applyEveryPrincipalConflictUpdate(store, candidate) {
      for (const upsert of principalConflictUpserts) {
        upsert(store, candidate);
      }
    },
  };
}

const migrationContract = migrationContractFromSql(MIGRATION_SQL);

function branchesFor(store: Store, businessId: string): Branch[] {
  return store.branches.filter((branch) => branch.businessId === businessId);
}

describe('public booking default-service branch contract', () => {
  it('keeps the migration file wired into the repository', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('backfills a branchless existing business with one active principal branch using the business timezone', () => {
    const store: Store = {
      businesses: [{ id: 'business-1', name: 'Orvel Beauty', timezone: 'America/Montevideo' }],
      branches: [],
    };

    migrationContract.runBranchlessBusinessBackfill(store);

    expect(branchesFor(store, 'business-1')).toEqual([
      {
        businessId: 'business-1',
        name: 'Orvel Beauty',
        slug: 'principal',
        timezone: 'America/Montevideo',
        isActive: true,
      },
    ]);
  });

  it('derives backfill fallback values from the migration insert expressions', () => {
    const store: Store = {
      businesses: [{ id: 'business-1', name: '   ', timezone: null }],
      branches: [],
    };

    migrationContract.runBranchlessBusinessBackfill(store);

    expect(branchesFor(store, 'business-1')).toEqual([
      {
        businessId: 'business-1',
        name: 'Sucursal principal',
        slug: 'principal',
        timezone: 'America/Argentina/Buenos_Aires',
        isActive: true,
      },
    ]);
  });

  it('derives insert-trigger fallback values from the migration insert expressions', () => {
    const store: Store = {
      businesses: [],
      branches: [],
    };

    migrationContract.applyBusinessInsertTrigger(store, {
      id: 'business-1',
      name: null,
      timezone: '   ',
    });

    expect(branchesFor(store, 'business-1')).toEqual([
      {
        businessId: 'business-1',
        name: 'Sucursal principal',
        slug: 'principal',
        timezone: 'America/Argentina/Buenos_Aires',
        isActive: true,
      },
    ]);
  });

  it('does not reactivate inactive branch rows or add a new branch during backfill', () => {
    const inactiveBranch: Branch = {
      businessId: 'business-1',
      name: 'Closed branch',
      slug: 'closed',
      timezone: 'America/Argentina/Cordoba',
      isActive: false,
    };
    const store: Store = {
      businesses: [{ id: 'business-1', name: 'Closed Business', timezone: 'America/Argentina/Buenos_Aires' }],
      branches: [inactiveBranch],
    };

    migrationContract.runBranchlessBusinessBackfill(store);

    expect(branchesFor(store, 'business-1')).toEqual([inactiveBranch]);
  });

  it('does not create an extra active principal branch when a timezone update finds an active non-principal branch', () => {
    const activeNonPrincipal: Branch = {
      businessId: 'business-1',
      name: 'Recoleta',
      slug: 'recoleta',
      timezone: 'America/Argentina/Buenos_Aires',
      isActive: true,
    };
    const store: Store = {
      businesses: [{ id: 'business-1', name: 'Orvel Beauty', timezone: 'America/Argentina/Buenos_Aires' }],
      branches: [activeNonPrincipal],
    };

    migrationContract.applyBusinessTimezoneUpdateTrigger(store, 'business-1', 'America/Montevideo');

    expect(branchesFor(store, 'business-1')).toEqual([activeNonPrincipal]);
  });

  it('keeps an existing principal branch inactive when the insert conflict path updates it', () => {
    const inactivePrincipal: Branch = {
      businessId: 'business-1',
      name: 'Principal paused by owner',
      slug: 'principal',
      timezone: null,
      isActive: false,
    };
    const store: Store = {
      businesses: [],
      branches: [inactivePrincipal],
    };

    migrationContract.applyBusinessInsertTrigger(store, {
      id: 'business-1',
      name: 'Orvel Beauty',
      timezone: 'America/Montevideo',
    });

    expect(branchesFor(store, 'business-1')).toEqual([
      {
        ...inactivePrincipal,
        timezone: 'America/Montevideo',
        isActive: false,
      },
    ]);
  });

  it('keeps an existing principal branch inactive for every migration conflict update clause', () => {
    const inactivePrincipal: Branch = {
      businessId: 'business-1',
      name: 'Principal paused by owner',
      slug: 'principal',
      timezone: null,
      isActive: false,
    };
    const store: Store = {
      businesses: [],
      branches: [inactivePrincipal],
    };

    migrationContract.applyEveryPrincipalConflictUpdate(
      store,
      migrationContract.branchInsertedByBusinessInsertTrigger({
        id: 'business-1',
        name: 'Orvel Beauty',
        timezone: 'America/Montevideo',
      })
    );

    expect(branchesFor(store, 'business-1')).toEqual([
      {
        ...inactivePrincipal,
        timezone: 'America/Montevideo',
        isActive: false,
      },
    ]);
  });
});
