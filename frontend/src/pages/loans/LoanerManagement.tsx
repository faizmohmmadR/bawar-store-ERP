import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  Users, 
  Plus, 
  Search,
  Phone,
  Mail,
  MapPin,
  Edit,
  Trash2
} from "lucide-react";
import useFetchObjects from "@/api/useFetchObjects";
import useDelete from "@/api/useDelete";
import { Loaner } from "@/types/loan";
import AddLoaner from "./AddLoaner";
import EditLoaner from "./EditLoaner";

interface LoanerManagementProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLoaner?: (loaner: Loaner) => void;
}

const LoanerManagement: React.FC<LoanerManagementProps> = ({ 
  isOpen, 
  onClose, 
  onSelectLoaner 
}) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedLoaner, setSelectedLoaner] = useState<Loaner | null>(null);

  const { data: loanerData, refetch } = useFetchObjects<Loaner[]>({
    queryKey: ["loaners", searchTerm],
    endpoint: "loaners/",
    params: {
      ...(searchTerm && { search: searchTerm }),
    },
  });

  const { handleDelete: deleteLoaner } = useDelete({
    queryKey: ["loaners"],
    customSuccessMessage: t("loans.loanerDeleteSuccess"),
  });

  const loaners = loanerData || [];

  const handleEdit = (loaner: Loaner) => {
    setSelectedLoaner(loaner);
    setIsEditOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t("loans.confirmDeleteLoaner"))) {
      await deleteLoaner(id);
      refetch();
    }
  };

  const handleSelect = (loaner: Loaner) => {
    if (onSelectLoaner) {
      onSelectLoaner(loaner);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-accent p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6" />
              <h2 className="text-xl font-bold">{t("loans.loanerManagement")}</h2>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="secondary"
                onClick={() => setIsAddOpen(true)}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <Plus className="h-4 w-4" />
                {t("loans.addLoaner")}
              </Button>
              <Button 
                variant="outline"
                onClick={onClose}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="p-6 border-b">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t("loans.searchLoaners")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ps-10"
            />
          </div>
        </div>

        {/* Loaners List */}
        <div className="p-6 overflow-y-auto max-h-96">
          {loaners.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t("loans.noLoaners")}
              </h3>
              <p className="text-gray-500 mb-4">
                {t("loans.noLoanersDesc")}
              </p>
              <Button onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("loans.addFirstLoaner")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loaners.map((loaner) => (
                <Card 
                  key={loaner.id} 
                  className="hover:shadow-md transition-all duration-200 cursor-pointer border-gray-200"
                  onClick={() => handleSelect(loaner)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">
                          {loaner.name}
                        </h3>
                        <Badge 
                          variant={loaner.is_active ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {loaner.is_active ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(loaner);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(loaner.id);
                          }}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600">
                      {loaner.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          <span>{loaner.phone}</span>
                        </div>
                      )}
                      {loaner.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          <span>{loaner.email}</span>
                        </div>
                      )}
                      {loaner.address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{loaner.address}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Modals */}
        <AddLoaner
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => {
            refetch();
            setIsAddOpen(false);
          }}
        />
        
        <EditLoaner
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          loaner={selectedLoaner}
          onSuccess={() => {
            refetch();
            setIsEditOpen(false);
          }}
        />
      </div>
    </div>
  );
};

export default LoanerManagement;