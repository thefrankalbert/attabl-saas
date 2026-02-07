'use client';

import { useRef, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface LaunchQRProps {
    url: string;
    tenantName: string;
    logoUrl?: string;
    primaryColor?: string;
    onDownload?: () => void;
}

export function LaunchQR({ url, tenantName, logoUrl, primaryColor = '#000000', onDownload }: LaunchQRProps) {
    const [downloading, setDownloading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const downloadQR = async () => {
        if (!qrRef.current) return;
        setDownloading(true);

        try {
            const canvas = await html2canvas(qrRef.current, {
                scale: 3,
                backgroundColor: '#FFFFFF',
                useCORS: true,
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [100, 100],
            });

            pdf.addImage(imgData, 'PNG', 0, 0, 100, 100);
            pdf.save(`qrcode-${tenantName.toLowerCase().replace(/\s/g, '-')}.pdf`);

            onDownload?.();
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setDownloading(false);
        }
    };

    if (!mounted) {
        return (
            <div className="p-5 rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 bg-gray-100 rounded-lg animate-pulse" />
                    <div className="flex-1">
                        <div className="h-5 w-24 bg-gray-100 rounded animate-pulse mb-2" />
                        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-5 rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-5">
                {/* QR Code Preview */}
                <div
                    ref={qrRef}
                    className="w-20 h-20 bg-white rounded-lg flex items-center justify-center flex-shrink-0 p-1"
                >
                    <QRCodeSVG
                        value={url}
                        size={72}
                        level="H"
                        includeMargin={false}
                        fgColor="#000000"
                        bgColor="#FFFFFF"
                    />
                </div>

                {/* Info & Download */}
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">QR Code</h3>
                    <p className="text-sm text-gray-500 mb-3">
                        Imprimez-le pour vos tables.
                    </p>
                    <Button
                        onClick={downloadQR}
                        disabled={downloading}
                        size="sm"
                        className="bg-gray-900 hover:bg-gray-800 text-white rounded-lg"
                    >
                        <Download className="h-4 w-4 mr-2" />
                        {downloading ? 'Génération...' : 'Télécharger'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
