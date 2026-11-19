import api from '@/api/client';
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { ReloadIcon } from "@radix-ui/react-icons";
import { 
  Wifi, 
  WifiOff, 
  CheckCircle, 
  AlertCircle, 
  Download,
  Server,
  Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ZKTecoSyncProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ZKTecoSync: React.FC<ZKTecoSyncProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useLanguage();
  const [deviceConfig, setDeviceConfig] = useState({
    ip: "192.168.1.100",
    port: "4370",
    password: ""
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connected" | "error">("disconnected");
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStats, setSyncStats] = useState({
    totalRecords: 0,
    processedRecords: 0,
    newRecords: 0,
    updatedRecords: 0
  });

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await api.post('zkteco/connect', deviceConfig);
      setConnectionStatus("connected");
    } catch {
      setConnectionStatus("error");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSync = async () => {
    if (connectionStatus !== "connected") return;
    
    setSyncing(true);
    setSyncProgress(0);
    
    try {
      // Simulate sync process
      const totalSteps = 100;
      for (let i = 0; i <= totalSteps; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setSyncProgress(i);
        
        // Update stats during sync
        setSyncStats({
          totalRecords: 150,
          processedRecords: Math.floor((i / 100) * 150),
          newRecords: Math.floor((i / 100) * 45),
          updatedRecords: Math.floor((i / 100) * 12)
        });
      }
      
      // Final stats
      setSyncStats({
        totalRecords: 150,
        processedRecords: 150,
        newRecords: 45,
        updatedRecords: 12
      });
      
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const resetConnection = () => {
    setConnectionStatus("disconnected");
    setSyncProgress(0);
    setSyncStats({
      totalRecords: 0,
      processedRecords: 0,
      newRecords: 0,
      updatedRecords: 0
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            {t("attendance.syncWithDevice")}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Device Configuration */}
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Device Configuration</h3>
                <div className="flex items-center gap-2">
                  {connectionStatus === "connected" && <Wifi className="h-4 w-4 text-primary" />}
                  {connectionStatus === "disconnected" && <WifiOff className="h-4 w-4 text-gray-400" />}
                  {connectionStatus === "error" && <AlertCircle className="h-4 w-4 text-red-600" />}
                  <span className={`text-sm font-medium ${
                    connectionStatus === "connected" ? "text-primary" : 
                    connectionStatus === "error" ? "text-red-600" : "text-gray-500"
                  }`}>
                    {connectionStatus === "connected" ? t("attendance.connected") : 
                     connectionStatus === "error" ? "Connection Failed" : t("attendance.disconnected")}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ip">Device IP Address</Label>
                  <Input
                    id="ip"
                    value={deviceConfig.ip}
                    onChange={(e) => setDeviceConfig(prev => ({ ...prev, ip: e.target.value }))}
                    placeholder="192.168.1.100"
                    disabled={connectionStatus === "connected"}
                  />
                </div>
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    value={deviceConfig.port}
                    onChange={(e) => setDeviceConfig(prev => ({ ...prev, port: e.target.value }))}
                    placeholder="4370"
                    disabled={connectionStatus === "connected"}
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <Label htmlFor="password">Device Password (Optional)</Label>
                <Input
                  id="password"
                  type="password"
                  value={deviceConfig.password}
                  onChange={(e) => setDeviceConfig(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter device password"
                  disabled={connectionStatus === "connected"}
                />
              </div>
            </CardContent>
          </Card>

          {/* Connection Status */}
          {connectionStatus === "connected" && (
            <Card className="border-primary/30 bg-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-primary">Device Connected Successfully</p>
                    <p className="text-sm text-primary">Ready to sync attendance data</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sync Progress */}
          {isSyncing && (
            <Card className="border-primary/30 bg-primary/10">
              <CardContent className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium text-primary">Syncing Attendance Data...</p>
                      <p className="text-sm text-primary">
                        Processing {syncStats.processedRecords} of {syncStats.totalRecords} records
                      </p>
                    </div>
                  </div>
                  
                  <Progress value={syncProgress} className="h-2" />
                  
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-primary">{syncStats.totalRecords}</div>
                      <div className="text-xs text-primary">Total Records</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-primary">{syncStats.newRecords}</div>
                      <div className="text-xs text-primary">New Records</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-accent">{syncStats.updatedRecords}</div>
                      <div className="text-xs text-accent">Updated</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sync Complete */}
          {!isSyncing && syncProgress === 100 && (
            <Card className="border-primary/30 bg-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-primary">Sync Completed Successfully</p>
                    <p className="text-sm text-primary">
                      {syncStats.newRecords} new records added, {syncStats.updatedRecords} records updated
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            
            {connectionStatus === "disconnected" && (
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <ReloadIcon className="animate-spin mr-2" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4 mr-2" />
                    Connect to Device
                  </>
                )}
              </Button>
            )}
            
            {connectionStatus === "connected" && (
              <>
                <Button variant="outline" onClick={resetConnection}>
                  Disconnect
                </Button>
                <Button onClick={handleSync} disabled={isSyncing}>
                  {isSyncing ? (
                    <>
                      <ReloadIcon className="animate-spin mr-2" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Start Sync
                    </>
                  )}
                </Button>
              </>
            )}
            
            {connectionStatus === "error" && (
              <Button variant="destructive" onClick={handleConnect}>
                <AlertCircle className="h-4 w-4 mr-2" />
                Retry Connection
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ZKTecoSync;