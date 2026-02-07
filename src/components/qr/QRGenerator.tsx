'use client';

import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, Check, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export type TemplateType = 'standard' | 'chevalet' | 'carte';

interface QRGeneratorProps {
    url: string;
    tenantName: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    description?: string;
}

export function QRGenerator({
    url,
    tenantName,
    logoUrl,
    primaryColor = '#000000',
    secondaryColor = '#FFFFFF',
    description,
}: QRGeneratorProps) {
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('standard');
    const [downloading, setDownloading] = useState(false);
    const templateRef = useRef<HTMLDivElement>(null);

    const templates = [
        { id: 'standard', name: 'Standard', size: '10×10 cm', desc: 'Format carré classique' },
        { id: 'chevalet', name: 'Chevalet', size: 'A6 vertical', desc: 'Pour les tables' },
        { id: 'carte', name: 'Carte', size: 'Carte de visite', desc: 'Format compact' },
    ] as const;

    const downloadPDF = async () => {
        if (!templateRef.current) return;
        setDownloading(true);

        try {
            const canvas = await html2canvas(templateRef.current, {
                scale: 3,
                backgroundColor: null,
                useCORS: true,
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: selectedTemplate === 'chevalet' ? 'portrait' : 'landscape',
                unit: 'mm',
                format: selectedTemplate === 'carte' ? [85, 55] : selectedTemplate === 'chevalet' ? [105, 148] : [100, 100],
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`qrcode-${tenantName.toLowerCase().replace(/\s/g, '-')}-${selectedTemplate}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setDownloading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            {/* Template Selection */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Choisissez un format</h3>
                <div className="grid grid-cols-3 gap-3">
                    {templates.map((template) => (
                        <button
                            key={template.id}
                            onClick={() => setSelectedTemplate(template.id)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${selectedTemplate === template.id
                                    ? 'border-gray-900 bg-gray-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-gray-900">{template.name}</span>
                                {selectedTemplate === template.id && (
                                    <Check className="h-4 w-4 text-gray-900" />
                                )}
                            </div>
                            <p className="text-xs text-gray-500">{template.size}</p>
                            <p className="text-xs text-gray-400 mt-1">{template.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Preview */}
            <div className="flex justify-center p-8 bg-gray-100 rounded-2xl">
                <div
                    ref={templateRef}
                    className="print:shadow-none"
                    style={{
                        transform: 'scale(0.8)',
                        transformOrigin: 'center',
                    }}
                >
                    {selectedTemplate === 'standard' && (
                        <StandardTemplate
                            url={url}
                            tenantName={tenantName}
                            logoUrl={logoUrl}
                            primaryColor={primaryColor}
                            secondaryColor={secondaryColor}
                        />
                    )}
                    {selectedTemplate === 'chevalet' && (
                        <ChevaletTemplate
                            url={url}
                            tenantName={tenantName}
                            logoUrl={logoUrl}
                            primaryColor={primaryColor}
                            secondaryColor={secondaryColor}
                            description={description}
                        />
                    )}
                    {selectedTemplate === 'carte' && (
                        <CarteTemplate
                            url={url}
                            tenantName={tenantName}
                            primaryColor={primaryColor}
                            secondaryColor={secondaryColor}
                        />
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <Button
                    onClick={downloadPDF}
                    disabled={downloading}
                    className="flex-1 h-12 bg-gray-900 hover:bg-gray-800 text-white rounded-xl"
                >
                    <Download className="h-5 w-5 mr-2" />
                    {downloading ? 'Génération...' : 'Télécharger PDF'}
                </Button>
                <Button
                    onClick={handlePrint}
                    variant="outline"
                    className="h-12 px-6 rounded-xl border-gray-200"
                >
                    <Printer className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
}

// Standard Template (10x10cm)
function StandardTemplate({
    url,
    tenantName,
    logoUrl,
    primaryColor,
    secondaryColor,
}: Omit<QRGeneratorProps, 'description'>) {
    return (
        <div
            className="w-[378px] h-[378px] p-8 flex flex-col items-center justify-center rounded-2xl shadow-xl"
            style={{ backgroundColor: secondaryColor }}
        >
            {/* Logo or Name */}
            <div className="mb-4 flex items-center gap-2">
                {logoUrl ? (
                    <img src={logoUrl} alt={tenantName} className="h-8 w-auto object-contain" />
                ) : (
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <Layout className="h-4 w-4 text-white" />
                    </div>
                )}
                <span className="text-lg font-bold" style={{ color: primaryColor }}>
                    {tenantName}
                </span>
            </div>

            {/* QR Code */}
            <div className="p-4 bg-white rounded-2xl shadow-inner">
                <QRCodeSVG
                    value={url}
                    size={200}
                    level="H"
                    includeMargin={false}
                    fgColor="#000000"
                    bgColor="#FFFFFF"
                />
            </div>

            {/* CTA */}
            <p
                className="mt-4 text-sm font-medium text-center"
                style={{ color: primaryColor }}
            >
                Scannez pour voir le menu
            </p>
        </div>
    );
}

// Chevalet Template (A6 vertical)
function ChevaletTemplate({
    url,
    tenantName,
    logoUrl,
    primaryColor,
    secondaryColor,
    description,
}: QRGeneratorProps) {
    return (
        <div
            className="w-[297px] h-[420px] p-6 flex flex-col items-center rounded-2xl shadow-xl"
            style={{ backgroundColor: primaryColor }}
        >
            {/* Header */}
            <div className="text-center mb-6">
                {logoUrl ? (
                    <img src={logoUrl} alt={tenantName} className="h-12 w-auto object-contain mx-auto mb-2" />
                ) : (
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"
                        style={{ backgroundColor: secondaryColor }}
                    >
                        <Layout className="h-6 w-6" style={{ color: primaryColor }} />
                    </div>
                )}
                <h2 className="text-xl font-bold" style={{ color: secondaryColor }}>
                    {tenantName}
                </h2>
                {description && (
                    <p className="text-xs mt-1 opacity-80" style={{ color: secondaryColor }}>
                        {description}
                    </p>
                )}
            </div>

            {/* QR Code */}
            <div className="p-4 bg-white rounded-2xl shadow-lg flex-1 flex items-center">
                <QRCodeSVG
                    value={url}
                    size={180}
                    level="H"
                    includeMargin={false}
                    fgColor="#000000"
                    bgColor="#FFFFFF"
                />
            </div>

            {/* Instructions */}
            <div className="mt-6 text-center" style={{ color: secondaryColor }}>
                <p className="text-lg font-bold mb-1">Scannez pour commander</p>
                <p className="text-xs opacity-70">Menu digital • Commande rapide</p>
            </div>
        </div>
    );
}

// Carte de visite Template
function CarteTemplate({
    url,
    tenantName,
    primaryColor,
    secondaryColor,
}: Omit<QRGeneratorProps, 'logoUrl' | 'description'>) {
    return (
        <div
            className="w-[321px] h-[207px] p-5 flex items-center gap-5 rounded-xl shadow-xl"
            style={{ backgroundColor: secondaryColor }}
        >
            {/* Left: Info */}
            <div className="flex-1">
                <h3 className="text-base font-bold mb-1" style={{ color: primaryColor }}>
                    {tenantName}
                </h3>
                <p className="text-xs text-gray-500 mb-3">Room Service</p>
                <div
                    className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: primaryColor, color: secondaryColor }}
                >
                    Scannez →
                </div>
            </div>

            {/* Right: QR */}
            <div className="p-2 bg-white rounded-xl shadow-inner">
                <QRCodeSVG
                    value={url}
                    size={100}
                    level="H"
                    includeMargin={false}
                    fgColor="#000000"
                    bgColor="#FFFFFF"
                />
            </div>
        </div>
    );
}
