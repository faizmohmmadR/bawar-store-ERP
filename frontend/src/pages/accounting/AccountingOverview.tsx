import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Lightbulb,
  ListTree,
  RefreshCw,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

type GuideTool = {
  key: string;
  path: string;
  icon: typeof BookOpen;
  descKey: string;
};

type NamedBody = { title: string; body: string };

const dailyTools: GuideTool[] = [
  {
    key: 'dailyLedger',
    path: '/accounting/daily-ledger',
    icon: BookOpenCheck,
    descKey: 'accounts.guide.toolDailyLedger',
  },
  {
    key: 'journalEntries',
    path: '/journal-entries',
    icon: Layers,
    descKey: 'accounts.guide.toolJournalEntries',
  },
];

const reportTools: GuideTool[] = [
  {
    key: 'trialBalance',
    path: '/accounting/trial-balance',
    icon: Scale,
    descKey: 'accounts.guide.toolTrialBalance',
  },
  {
    key: 'incomeStatement',
    path: '/accounting/income-statement',
    icon: TrendingUp,
    descKey: 'accounts.guide.toolIncomeStatement',
  },
  {
    key: 'balanceSheet',
    path: '/accounting/balance-sheet',
    icon: FileSpreadsheet,
    descKey: 'accounts.guide.toolBalanceSheet',
  },
];

const currencyTools: GuideTool[] = [
  {
    key: 'currencyExchanges',
    path: '/accounting/currency-exchanges',
    icon: ArrowLeftRight,
    descKey: 'accounts.guide.toolCurrencyExchanges',
  },
  {
    key: 'fxRevaluations',
    path: '/accounting/fx-revaluations',
    icon: RefreshCw,
    descKey: 'accounts.guide.toolFxRevaluations',
  },
];

const setupTools: GuideTool[] = [
  {
    key: 'glAccounts',
    path: '/gl-accounts',
    icon: ListTree,
    descKey: 'accounts.guide.toolGlAccounts',
  },
  {
    key: 'fiscalYears',
    path: '/accounting/fiscal-years',
    icon: CalendarRange,
    descKey: 'accounts.guide.toolFiscalYears',
  },
];

function ToolLink({
  tool,
  label,
  description,
  openLabel,
}: {
  tool: GuideTool;
  label: string;
  description: string;
  openLabel: string;
}) {
  const Icon = tool.icon;
  return (
    <Link
      to={tool.path}
      className="group flex gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{label}</h4>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary opacity-80 group-hover:opacity-100">
            {openLabel}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof BookOpen;
  children: ReactNode;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight">
      <Icon className="h-5 w-5 text-primary" />
      {children}
    </h2>
  );
}

function InfoList({ items }: { items: NamedBody[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.title} className="rounded-lg border bg-background p-3 sm:p-4">
          <h3 className="text-sm font-semibold">{item.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {item.body}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function AccountingOverview() {
  const { t } = useLanguage();

  const ideas = [
    {
      icon: Wallet,
      title: t('accounts.guide.ideaCurrencyTitle'),
      body: t('accounts.guide.ideaCurrencyBody'),
    },
    {
      icon: Scale,
      title: t('accounts.guide.ideaAfnTitle'),
      body: t('accounts.guide.ideaAfnBody'),
    },
    {
      icon: Layers,
      title: t('accounts.guide.ideaJournalTitle'),
      body: t('accounts.guide.ideaJournalBody'),
    },
    {
      icon: CheckCircle2,
      title: t('accounts.guide.ideaBranchTitle'),
      body: t('accounts.guide.ideaBranchBody'),
    },
  ];

  const steps = [
    { title: t('accounts.guide.step1Title'), body: t('accounts.guide.step1Body') },
    { title: t('accounts.guide.step2Title'), body: t('accounts.guide.step2Body') },
    { title: t('accounts.guide.step3Title'), body: t('accounts.guide.step3Body') },
    { title: t('accounts.guide.step4Title'), body: t('accounts.guide.step4Body') },
  ];

  const tips = [
    t('accounts.guide.tip1'),
    t('accounts.guide.tip2'),
    t('accounts.guide.tip3'),
    t('accounts.guide.tip4'),
    t('accounts.guide.tip5'),
  ];

  const debitCreditCards = [
    {
      title: t('accounts.guide.debitMeansTitle'),
      body: t('accounts.guide.debitMeansBody'),
    },
    {
      title: t('accounts.guide.creditMeansTitle'),
      body: t('accounts.guide.creditMeansBody'),
    },
  ];

  const accountTypes: NamedBody[] = [
    { title: t('accounts.guide.typeAssetTitle'), body: t('accounts.guide.typeAssetBody') },
    { title: t('accounts.guide.typeLiabilityTitle'), body: t('accounts.guide.typeLiabilityBody') },
    { title: t('accounts.guide.typeEquityTitle'), body: t('accounts.guide.typeEquityBody') },
    { title: t('accounts.guide.typeRevenueTitle'), body: t('accounts.guide.typeRevenueBody') },
    { title: t('accounts.guide.typeExpenseTitle'), body: t('accounts.guide.typeExpenseBody') },
  ];

  const commonAccounts: NamedBody[] = [
    { title: t('accounts.guide.accCashTitle'), body: t('accounts.guide.accCashBody') },
    { title: t('accounts.guide.accArTitle'), body: t('accounts.guide.accArBody') },
    { title: t('accounts.guide.accApTitle'), body: t('accounts.guide.accApBody') },
    { title: t('accounts.guide.accInventoryTitle'), body: t('accounts.guide.accInventoryBody') },
    { title: t('accounts.guide.accSalesTitle'), body: t('accounts.guide.accSalesBody') },
    { title: t('accounts.guide.accCogsTitle'), body: t('accounts.guide.accCogsBody') },
    { title: t('accounts.guide.accExpenseTitle'), body: t('accounts.guide.accExpenseBody') },
    { title: t('accounts.guide.accFxTitle'), body: t('accounts.guide.accFxBody') },
    { title: t('accounts.guide.accReTitle'), body: t('accounts.guide.accReBody') },
  ];

  const toolGroups = [
    { title: t('accounts.guide.groupDaily'), tools: dailyTools },
    { title: t('accounts.guide.groupReports'), tools: reportTools },
    { title: t('accounts.guide.groupCurrency'), tools: currencyTools },
    { title: t('accounts.guide.groupSetup'), tools: setupTools },
  ];

  const navLabel = (key: string) => t(`core.navigation.${key}`);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="space-y-3 border-b pb-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-heading font-bold tracking-tight">
              {t('accounts.guide.title')}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t('accounts.guide.subtitle')}
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">
          {t('accounts.guide.intro')}
        </p>
      </header>

      <section>
        <SectionTitle icon={CheckCircle2}>{t('accounts.guide.startHere')}</SectionTitle>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-lg border bg-muted/20 p-4">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  'bg-primary text-xs font-bold text-primary-foreground',
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionTitle icon={Scale}>{t('accounts.guide.debitCreditTitle')}</SectionTitle>
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          {t('accounts.guide.debitCreditIntro')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {debitCreditCards.map((card) => (
            <Card key={card.title} className="shadow-sm">
              <CardContent className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">{card.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{card.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle icon={ListTree}>{t('accounts.guide.accountTypesTitle')}</SectionTitle>
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          {t('accounts.guide.accountTypesIntro')}
        </p>
        <InfoList items={accountTypes} />
      </section>

      <section>
        <SectionTitle icon={Wallet}>{t('accounts.guide.commonAccountsTitle')}</SectionTitle>
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          {t('accounts.guide.commonAccountsIntro')}
        </p>
        <InfoList items={commonAccounts} />
      </section>

      <section>
        <SectionTitle icon={Lightbulb}>{t('accounts.guide.ideasTitle')}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {ideas.map((idea) => {
            const Icon = idea.icon;
            return (
              <Card key={idea.title} className="shadow-sm">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">{idea.title}</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{idea.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-6">
        <SectionTitle icon={BookOpen}>{t('accounts.guide.toolsTitle')}</SectionTitle>
        {toolGroups.map((group) => (
          <div key={group.title} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </h3>
            <div className="grid gap-2">
              {group.tools.map((tool) => (
                <ToolLink
                  key={tool.key}
                  tool={tool}
                  label={navLabel(tool.key)}
                  description={t(tool.descKey)}
                  openLabel={t('accounts.guide.openTool')}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <SectionTitle icon={Lightbulb}>{t('accounts.guide.tipsTitle')}</SectionTitle>
        <Card className="shadow-sm">
          <CardContent className="space-y-3 p-4">
            {tips.map((tip) => (
              <div key={tip} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <p className="text-muted-foreground">{tip}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
