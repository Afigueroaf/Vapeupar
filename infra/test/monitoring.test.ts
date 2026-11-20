// Comprobaciones de la vigilancia (F6) sobre la app COMPLETA, sintetizada en
// memoria con el mismo `buildApp` que despliega `bin/vapeupar.ts`. No llama a
// AWS: el contexto sale de cdk.json y cdk.context.json (AMI fijada).
//
//   npm run test --workspace=infra
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { buildApp } from '../lib/build-app.js';
import { getConfig } from '../lib/config.js';
import { MAX_ALARMS, MAX_CUSTOM_METRICS, METRICS_NAMESPACE } from '../lib/monitoring-stack.js';

// El paquete infra es CommonJS (sin "type": "module"): `__dirname` existe.
const root = path.resolve(__dirname, '..');
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

/** Las 10 alarmas acordadas en el plan de f6-vigilancia-alarmas, ni una más. */
const EXPECTED_ALARMS = [
  'vapeupar-dev-ec2-status-system',
  'vapeupar-dev-ec2-status-instance',
  'vapeupar-dev-ec2-cpu',
  'vapeupar-dev-ec2-cpu-credits',
  'vapeupar-dev-rds-storage',
  'vapeupar-dev-rds-connections',
  'vapeupar-dev-rds-memory',
  'vapeupar-dev-mem',
  'vapeupar-dev-disk',
  'vapeupar-dev-cert',
];

type Resource = { Type: string; Properties: Record<string, any> };

describe('vigilancia (F6)', () => {
  let outdir: string;
  let stacks: ReturnType<typeof buildApp>;
  let alarms: Resource[];

  before(() => {
    outdir = mkdtempSync(path.join(tmpdir(), 'vapeupar-cdk-test-'));
    const app = new App({
      outdir,
      context: { ...readJson('cdk.json').context, ...readJson('cdk.context.json') },
    });
    stacks = buildApp(app, getConfig('dev'), 'alertas@example.com');
    app.synth();
    alarms = Object.values(stacks)
      .flatMap((stack: Stack) => Object.values(Template.fromStack(stack).toJSON().Resources ?? {}) as Resource[])
      .filter((r) => r.Type === 'AWS::CloudWatch::Alarm');
  });

  after(() => rmSync(outdir, { recursive: true, force: true }));

  test(`no más de ${MAX_ALARMS} alarmas en toda la app (capa gratuita compartida con DeliPan)`, () => {
    const names = alarms.map((a) => a.Properties.AlarmName).sort();
    console.log(`  alarmas de Vapeupar: ${alarms.length}/${MAX_ALARMS}\n  - ${names.join('\n  - ')}`);
    assert.ok(alarms.length <= MAX_ALARMS, `hay ${alarms.length} alarmas; el máximo es ${MAX_ALARMS}`);
    assert.deepEqual(names, [...EXPECTED_ALARMS].sort());
  });

  test('todas avisan al tema SNS y solo vapeupar-dev-ec2-status-system recupera la EC2', () => {
    const t = Template.fromStack(stacks.monitoring);
    const [topicId] = Object.keys(t.findResources('AWS::SNS::Topic'));
    for (const a of alarms) {
      const actions = JSON.stringify(a.Properties.AlarmActions);
      assert.ok(actions.includes(topicId), `${a.Properties.AlarmName} no avisa al tema`);
      assert.equal(actions.includes(':ec2:recover'), a.Properties.AlarmName === 'vapeupar-dev-ec2-status-system');
    }
    t.hasResourceProperties('AWS::SNS::Topic', { TopicName: 'vapeupar-dev-alerts' });
    t.resourceCountIs('AWS::SNS::Subscription', 1);
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'alertas@example.com' });
  });

  test('el tema admite publicar a CloudWatch solo desde las alarmas de Vapeupar de esta cuenta', () => {
    // Con enforceSSL la política del tema sustituye a la predeterminada: sin
    // un Allow explícito, ninguna alarma podría publicar.
    const policies = Object.values(Template.fromStack(stacks.monitoring).findResources('AWS::SNS::TopicPolicy'));
    assert.equal(policies.length, 1);
    const statements = (policies[0] as any).Properties.PolicyDocument.Statement as any[];
    const allow = statements.filter((s) => s.Effect === 'Allow');
    assert.equal(allow.length, 1, 'falta el Allow de sns:Publish para CloudWatch');
    assert.deepEqual(allow[0].Principal, { Service: 'cloudwatch.amazonaws.com' });
    assert.equal(allow[0].Action, 'sns:Publish');
    const account = getConfig('dev').account;
    assert.deepEqual(allow[0].Condition, {
      StringEquals: { 'aws:SourceAccount': account },
      ArnLike: { 'aws:SourceArn': `arn:aws:cloudwatch:us-east-1:${account}:alarm:vapeupar-dev-*` },
    });
    // Todas las alarmas caen bajo ese prefijo.
    for (const a of alarms) assert.ok(a.Properties.AlarmName.startsWith('vapeupar-dev-'), a.Properties.AlarmName);
  });

  test(`el script de métricas envía como mucho ${MAX_CUSTOM_METRICS} métricas propias y todas tienen alarma`, () => {
    const script = readFileSync(path.join(root, 'deploy/metrics/vapeupar-metrics.sh'), 'utf8');
    const sent = [...new Set([...script.matchAll(/\bdatum\s+([A-Za-z]+)\s/g)].map((m) => m[1]))].sort();
    console.log(`  métricas propias: ${sent.length}/${MAX_CUSTOM_METRICS} (${sent.join(', ')})`);
    assert.ok(sent.length > 0, 'no se encontraron llamadas a datum en el script');
    assert.ok(sent.length <= MAX_CUSTOM_METRICS, `envía ${sent.length}; el máximo es ${MAX_CUSTOM_METRICS}`);
    const withAlarm = alarms
      .filter((a) => a.Properties.Namespace === METRICS_NAMESPACE)
      .map((a) => a.Properties.MetricName)
      .sort();
    assert.deepEqual(sent, withAlarm);
  });

  test('memoria, disco y certificado tratan la falta de datos como fallo (vigilan el timer)', () => {
    const own = alarms.filter((a) => a.Properties.Namespace === METRICS_NAMESPACE);
    assert.deepEqual(own.map((a) => a.Properties.AlarmName).sort(), [
      'vapeupar-dev-cert',
      'vapeupar-dev-disk',
      'vapeupar-dev-mem',
    ]);
    for (const a of own) assert.equal(a.Properties.TreatMissingData, 'breaching', a.Properties.AlarmName);
  });

  test('el stack de vigilancia no importa exports de otros stacks', () => {
    const json = JSON.stringify(Template.fromStack(stacks.monitoring).toJSON());
    assert.ok(!json.includes('Fn::ImportValue'), 'usa Fn::ImportValue: bloquearía reemplazar la EC2');
  });

  test('el rol de la app solo puede publicar métricas en el namespace Vapeupar', () => {
    const policies = Template.fromStack(stacks.app).findResources('AWS::IAM::Policy');
    const statements = Object.values(policies).flatMap((p: any) => p.Properties.PolicyDocument.Statement);
    const put = statements.filter((s: any) => [s.Action].flat().some((x: string) => x.startsWith('cloudwatch:')));
    assert.equal(put.length, 1);
    assert.equal(put[0].Action, 'cloudwatch:PutMetricData');
    assert.deepEqual(put[0].Condition, { StringEquals: { 'cloudwatch:namespace': METRICS_NAMESPACE } });
    assert.ok(!statements.some((s: any) => [s.Action].flat().some((x: string) => x.startsWith('logs:'))));
  });
});
