import { MetricsLogger } from 'aws-embedded-metrics'

export type RoutingMetrics = Pick<
  MetricsLogger,
  'setNamespace' | 'setDimensions' | 'putMetric' | 'setProperty' | 'putDimensions'
>

export class NoopRoutingMetrics implements RoutingMetrics {
  setNamespace(_: string) { return this as any }
  setDimensions(_: Record<string, string>) { return this as any }
  putDimensions(_: Record<string, string>) { return this as any }
  putMetric(_: string, __: number, ___?: any) { return this as any }
  setProperty(_: string, __: unknown) { return this as any }
}