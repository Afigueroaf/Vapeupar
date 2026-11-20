// La base de datos (F7): pasar a la contraseña maestra gestionada por RDS NO
// puede reemplazar la instancia. Se comprueba sobre la app COMPLETA,
// sintetizada en memoria con el mismo `buildApp` que despliega
// `bin/vapeupar.ts`. No llama a AWS.
//
//   npm run test --workspace=infra
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { buildApp } from '../lib/build-app.js';
import { getConfig } from '../lib/config.js';

const root = path.resolve(__dirname, '..');
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

type Resource = { Type: string; Properties: Record<string, any>; DeletionPolicy?: string; UpdateReplacePolicy?: string };

/**
 * Id lógico de la instancia en el stack desplegado. Si cambia, CloudFormation
 * crea una base NUEVA y vacía (y la vieja queda retenida, fuera del stack).
 */
const DB_LOGICAL_ID = 'Db5D02A0A9';

/**
 * Propiedades de AWS::RDS::DBInstance cuyo cambio exige REEMPLAZO (o lo
 * provoca en algunos casos), con el valor desplegado hoy. `undefined` = no
 * debe aparecer.
 */
const REPLACEMENT_PROPS: Record<string, unknown> = {
  DBInstanceIdentifier: 'vapeupar-dev-db',
  DBName: 'vapeupar',
  Engine: 'postgres',
  MasterUsername: 'vapeupar_admin',
  StorageEncrypted: true,
  DBSubnetGroupName: { Ref: 'DbSubnetGroup6F6C177A' },
  KmsKeyId: undefined,
  AvailabilityZone: undefined,
  CharacterSetName: undefined,
  DBClusterIdentifier: undefined,
  DBSnapshotIdentifier: undefined,
  SourceDBInstanceIdentifier: undefined,
  Timezone: undefined,
};

describe('base de datos (F7: contraseña maestra gestionada)', () => {
  let outdir: string;
  let data: Record<string, Resource>;
  let appTemplate: any;

  before(() => {
    outdir = mkdtempSync(path.join(tmpdir(), 'vapeupar-cdk-test-'));
    const app = new App({
      outdir,
      context: { ...readJson('cdk.json').context, ...readJson('cdk.context.json') },
    });
    const stacks = buildApp(app, getConfig('dev'), 'alertas@example.com');
    app.synth();
    data = Template.fromStack(stacks.data).toJSON().Resources;
    appTemplate = Template.fromStack(stacks.app).toJSON();
  });

  after(() => rmSync(outdir, { recursive: true, force: true }));

  test('la instancia conserva su id lógico y una sola DBInstance', () => {
    const instances = Object.entries(data).filter(([, r]) => r.Type === 'AWS::RDS::DBInstance');
    assert.deepEqual(instances.map(([id]) => id), [DB_LOGICAL_ID]);
  });

  test('ninguna propiedad de reemplazo cambia', () => {
    const props = data[DB_LOGICAL_ID].Properties;
    for (const [key, expected] of Object.entries(REPLACEMENT_PROPS)) {
      assert.deepEqual(props[key], expected, `DBInstance.${key}`);
    }
  });

  test('la base sigue retenida y con protección de borrado', () => {
    const db = data[DB_LOGICAL_ID];
    assert.equal(db.DeletionPolicy, 'Retain');
    assert.equal(db.UpdateReplacePolicy, 'Retain');
    assert.equal(db.Properties.DeletionProtection, true);
  });

  test('la contraseña la gestiona RDS: sin MasterUserPassword ni secreto de CDK', () => {
    const props = data[DB_LOGICAL_ID].Properties;
    assert.equal(props.ManageMasterUserPassword, true);
    assert.equal(props.MasterUserPassword, undefined);
    const types = Object.values(data).map((r) => r.Type);
    assert.ok(!types.includes('AWS::SecretsManager::SecretTargetAttachment'), 'sobra el SecretTargetAttachment');
    const names = Object.values(data)
      .filter((r) => r.Type === 'AWS::SecretsManager::Secret')
      .map((r) => r.Properties.Name);
    assert.deepEqual(names, ['vapeupar/dev/rds-app'], 'solo queda el secreto del rol vapeupar_app');
  });

  test('DB_SECRET_ARN apunta al secreto gestionado', () => {
    const param = Object.values(data).find(
      (r) => r.Type === 'AWS::SSM::Parameter' && r.Properties.Name === '/vapeupar/dev/DB_SECRET_ARN',
    );
    assert.ok(param, 'falta el parámetro DB_SECRET_ARN');
    assert.deepEqual(param.Properties.Value, { 'Fn::GetAtt': [DB_LOGICAL_ID, 'MasterUserSecret.SecretArn'] });
  });

  test('la EC2 lee el maestro por su ARN exacto (parámetro SSM), sin comodines rds!', () => {
    const ssmParam = Object.entries(appTemplate.Parameters ?? {}).find(
      ([, p]: [string, any]) => p.Default === '/vapeupar/dev/DB_SECRET_ARN',
    );
    assert.ok(ssmParam, 'App no lee DB_SECRET_ARN de SSM');
    const statements = Object.values(appTemplate.Resources as Record<string, Resource>)
      .filter((r) => r.Type === 'AWS::IAM::Policy')
      .flatMap((r) => r.Properties.PolicyDocument.Statement)
      .filter((s: any) => [s.Action].flat().includes('secretsmanager:GetSecretValue'));
    const resources = statements.flatMap((s: any) => [s.Resource].flat());
    assert.ok(resources.some((r: any) => r?.Ref === ssmParam[0]), 'el permiso no usa el ARN del parámetro');
    const text = JSON.stringify(resources);
    assert.ok(!text.includes('rds!'), 'un comodín rds!db-* alcanzaría a DeliPan');
    assert.ok(!text.includes('rds-master'), 'queda el permiso al secreto viejo');
  });
});
