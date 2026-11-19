import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  AlertCircle,
  FileText,
  CheckCircle
} from "lucide-react";
import { LoanSummary } from "@/types/loan";
import { formatLoanMoney } from "@/lib/loanFormat";

interface LoanStatsProps {
  summary: LoanSummary;
}

const LoanStats: React.FC<LoanStatsProps> = ({ summary }) => {
  const { t } = useLanguage();

  const stats = [
    {
      title: t("loans.stats.totalLoanIn"),
      value: formatLoanMoney(summary.total_loan_in, null),
      icon: TrendingUp,
      color: "from-primary to-primary-dark",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
    },
    {
      title: t("loans.stats.totalLoanOut"),
      value: formatLoanMoney(summary.total_loan_out, null),
      icon: TrendingDown,
      color: "from-red-500 to-red-600",
      bgColor: "bg-red-50",
      textColor: "text-red-700",
    },
    {
      title: t("loans.stats.netBalance"),
      value: formatLoanMoney(summary.net_balance, null),
      icon: DollarSign,
      color: summary.net_balance >= 0 ? "from-primary to-primary-dark" : "from-accent to-accent",
      bgColor: summary.net_balance >= 0 ? "bg-primary/10" : "bg-accent/10",
      textColor: summary.net_balance >= 0 ? "text-primary" : "text-accent",
    },
    {
      title: t("loans.stats.unpaidLoanIn"),
      value: formatLoanMoney(summary.unpaid_loan_in, null),
      icon: AlertCircle,
      color: "from-yellow-500 to-yellow-600",
      bgColor: "bg-yellow-50",
      textColor: "text-yellow-700",
    },
    {
      title: t("loans.stats.unpaidLoanOut"),
      value: formatLoanMoney(summary.unpaid_loan_out, null),
      icon: AlertCircle,
      color: "from-accent to-accent",
      bgColor: "bg-accent/10",
      textColor: "text-accent",
    },
    {
      title: t("loans.stats.totalLoans"),
      value: summary.total_loans.toString(),
      icon: FileText,
      color: "from-primary-dark to-primary",
      bgColor: "bg-accent/10",
      textColor: "text-accent",
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-200">
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className={`inline-flex p-2 rounded-lg bg-gradient-to-r ${stat.color} mb-2`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600 leading-tight">
                      {stat.title}
                    </p>
                    <div className="flex items-end gap-1">
                      <p className="text-lg font-bold text-gray-900">
                        {stat.value}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Decorative gradient */}
              <div className={`absolute top-0 right-0 w-12 h-12 bg-gradient-to-br ${stat.color} opacity-10 rounded-bl-full`} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default LoanStats;