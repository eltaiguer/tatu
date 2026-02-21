// CSV Import - Drag and drop file upload with validation

import { Card } from './ui/card';
import { Button } from './ui/button';
import { Upload, FileText, Check, CircleAlert, Loader } from 'lucide-react';
import { useState } from 'react';
import { parseCSV } from '../services/parsers/csv-parser';
import { transactionStore } from '../stores/transaction-store';
import type { ParsedData, Transaction } from '../models';

type ImportState = 'idle' | 'validating' | 'success' | 'error';
type UiFileType = 'credit_card' | 'usd_account' | 'uyu_account';

interface ImportCSVProps {
  onImportComplete?: () => void;
  onTransactionsImported?: (
    transactions: Transaction[],
    context?: {
      parsedData: ParsedData;
      csvContent: string;
      fileName: string;
    }
  ) => Promise<{
    added: Transaction[];
    duplicates: Transaction[];
  }>;
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsText(file);
  });
}

export function ImportCSV({
  onImportComplete,
  onTransactionsImported,
}: ImportCSVProps) {
  const [importState, setImportState] = useState<ImportState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<UiFileType | null>(null);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    imported: number;
    duplicates: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setImportState('error');
      setFileName(file.name);
      setErrorMessage('El archivo debe estar en formato CSV');
      return;
    }

    setFileName(file.name);
    setImportState('validating');
    setErrorMessage('');

    try {
      const csvContent = await readFileAsText(file);
      const result = parseCSV(csvContent, file.name);

      if (result.fileType === 'credit_card') {
        setFileType('credit_card');
      } else if (result.fileType === 'bank_account_usd') {
        setFileType('usd_account');
      } else {
        setFileType('uyu_account');
      }

      const { added, duplicates } = onTransactionsImported
        ? await onTransactionsImported(result.transactions, {
            parsedData: result,
            csvContent,
            fileName: file.name,
          })
        : transactionStore.getState().addTransactions(result.transactions);

      setImportSummary({
        total: result.transactions.length,
        imported: added.length,
        duplicates: duplicates.length,
      });

      setImportState('success');

      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error) {
      setImportState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Error al procesar el archivo'
      );
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      void handleFile(e.target.files[0]);
    }
  };

  const resetImport = () => {
    setImportState('idle');
    setFileName('');
    setFileType(null);
    setImportSummary(null);
    setErrorMessage('');
  };

  const getAccountTypeLabel = (type: UiFileType) => {
    switch (type) {
      case 'credit_card':
        return 'Tarjeta de Crédito';
      case 'usd_account':
        return 'Cuenta USD';
      case 'uyu_account':
        return 'Cuenta UYU';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1">Importar Transacciones</h2>
        <p className="text-muted-foreground">
          Importá extractos CSV de Santander Uruguay
        </p>
      </div>

      <Card className="p-8">
        {importState === 'idle' && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 transition-all text-center ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Upload className="text-primary" size={32} />
              </div>
              <div>
                <p className="font-medium mb-1">Arrastrá tu archivo CSV aquí</p>
                <p className="text-sm text-muted-foreground">
                  o hacé clic para seleccionar
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
                id="file-upload"
              />
              <Button asChild>
                <label htmlFor="file-upload" className="cursor-pointer">
                  Seleccionar archivo
                </label>
              </Button>
            </div>
          </div>
        )}

        {importState === 'validating' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader className="animate-spin text-primary" size={48} />
              <div>
                <p className="font-medium mb-1">Validando archivo...</p>
                <p className="text-sm text-muted-foreground">{fileName}</p>
              </div>
            </div>
          </div>
        )}

        {importState === 'success' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-success-100 dark:bg-success-900/20">
                <Check className="text-success-600" size={48} />
              </div>
              <div>
                <p className="font-medium mb-1">Importación completada</p>
                <p className="text-sm text-muted-foreground mb-4">{fileName}</p>
                {fileType && (
                  <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
                    {getAccountTypeLabel(fileType)}
                  </div>
                )}
                {importSummary && (
                  <p className="text-sm text-muted-foreground mt-3">
                    {importSummary.imported} de {importSummary.total}{' '}
                    transacciones guardadas
                    {importSummary.duplicates > 0 && (
                      <> ({importSummary.duplicates} duplicadas omitidas)</>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <Button onClick={resetImport} variant="outline">
                  Importar otro archivo
                </Button>
                {onImportComplete && (
                  <Button onClick={onImportComplete}>Ver transacciones</Button>
                )}
              </div>
            </div>
          </div>
        )}

        {importState === 'error' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/20">
                <CircleAlert className="text-destructive" size={48} />
              </div>
              <div>
                <p className="font-medium mb-1">Error al validar archivo</p>
                <p className="text-sm text-muted-foreground mb-2">{fileName}</p>
                <p className="text-sm text-destructive">
                  {errorMessage || 'El archivo debe estar en formato CSV'}
                </p>
              </div>
              <Button onClick={resetImport}>Intentar nuevamente</Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
              <FileText className="text-primary" size={20} />
            </div>
            <h4>Tarjeta de Crédito</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Extracto de tarjeta Santander con compras y pagos en UYU y USD.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent-50 dark:bg-accent-900/20">
              <FileText className="text-accent" size={20} />
            </div>
            <h4>Cuenta USD</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Caja de ahorro en dólares con movimientos de débito y crédito.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-success-50 dark:bg-success-900/20">
              <FileText className="text-success-600" size={20} />
            </div>
            <h4>Cuenta UYU</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Caja de ahorro en pesos uruguayos con todas las operaciones.
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h4 className="mb-4">Cómo obtener tu extracto CSV</h4>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              1
            </span>
            <span>Ingresá a tu Home Banking de Santander Uruguay</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              2
            </span>
            <span>Seleccioná la cuenta o tarjeta que querés exportar</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              3
            </span>
            <span>Buscá la opción "Exportar" o "Descargar movimientos"</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              4
            </span>
            <span>Seleccioná formato CSV y el período deseado</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              5
            </span>
            <span>Descargá el archivo y arrastralo a esta pantalla</span>
          </li>
        </ol>
      </Card>

      <Card className="p-4 bg-primary-50 dark:bg-primary-900/10 border-primary/20">
        <p className="text-sm">
          <strong>Tu privacidad es importante:</strong> Los archivos se procesan
          localmente en tu navegador. Tatú no envía tus datos financieros a
          ningún servidor externo.
        </p>
      </Card>
    </div>
  );
}
