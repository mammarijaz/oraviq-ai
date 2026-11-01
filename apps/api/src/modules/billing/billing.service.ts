import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingPeriod: 'monthly' | 'yearly';
  features: string[];
  limits: {
    agents: number;
    conversations: number;
    channels: number;
  };
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 0,
    currency: 'USD',
    billingPeriod: 'monthly',
    features: ['1 channel', '1 agent', 'Basic AI', '1K conversations/mo'],
    limits: { agents: 1, conversations: 1000, channels: 1 },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    currency: 'USD',
    billingPeriod: 'monthly',
    features: ['All channels', '10 agents', 'Advanced AI', '10K conversations/mo', 'Analytics'],
    limits: { agents: 10, conversations: 10000, channels: 5 },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    currency: 'USD',
    billingPeriod: 'monthly',
    features: [
      'All channels',
      'Unlimited agents',
      'Custom AI',
      'Unlimited conversations',
      'Dedicated support',
      'SLA',
    ],
    limits: { agents: -1, conversations: -1, channels: -1 },
  },
];

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentPlan(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, plan: true, name: true },
    });
    if (!org) throw new NotFoundException('Organisation not found');

    const plan = PLANS.find((p) => p.id === org.plan) ?? PLANS[0];
    return { organisationId: org.id, currentPlan: plan };
  }

  getPlans(): Plan[] {
    return PLANS;
  }

  async getBillingHistory(orgId: string) {
    return this.prisma.billingEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
