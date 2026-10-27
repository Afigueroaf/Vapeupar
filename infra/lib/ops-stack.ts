import { Stack, StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as resourcegroups from 'aws-cdk-lib/aws-resourcegroups';
import { Construct } from 'constructs';
import { EnvConfig, resourceName } from './config.js';

interface OpsStackProps extends StackProps {
  config: EnvConfig;
  alertEmail: string;
}

/**
 * Separación operativa frente a DeliPan en la cuenta compartida:
 *
 * - Grupo de recursos por etiqueta: una vista en consola con solo Vapeupar.
 * - Presupuesto filtrado por `Project=Vapeupar`. Depende de que la etiqueta
 *   `Project` esté activada como etiqueta de asignación de costos (es un ajuste
 *   de la cuenta, no de este stack; ver docs/infrastructure-aws.md §4).
 */
export class OpsStack extends Stack {
  constructor(scope: Construct, id: string, props: OpsStackProps) {
    super(scope, id, props);
    const { config, alertEmail } = props;

    new resourcegroups.CfnGroup(this, 'ResourceGroup', {
      name: resourceName(config, 'resources'),
      description: `Recursos de Vapeupar ${config.envName} por etiquetas Project y Environment`,
      resourceQuery: {
        type: 'TAG_FILTERS_1_0',
        query: {
          resourceTypeFilters: ['AWS::AllSupported'],
          tagFilters: [
            { key: 'Project', values: ['Vapeupar'] },
            { key: 'Environment', values: [config.envName] },
          ],
        },
      },
    });

    const subscribers = [{ subscriptionType: 'EMAIL', address: alertEmail }];

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: resourceName(config, 'monthly'),
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: config.monthlyBudgetUsd, unit: 'USD' },
        costFilters: {
          TagKeyValue: [`user:Project$Vapeupar`, `user:Environment$${config.envName}`],
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
      ],
    });
  }
}
