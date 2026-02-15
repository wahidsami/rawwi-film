import { useState, useRef } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { cn } from '@/utils/cn';

interface FileUploadProps {
    label: string;
    accept?: string;
    helperText?: string;
    onChange: (file: File | null) => void;
    className?: string;
}

export function FileUpload({ label, accept, helperText, onChange, className }: FileUploadProps) {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = (file: File) => {
        setFile(file);
        onChange(file);
    };

    const removeFile = () => {
        setFile(null);
        onChange(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    return (
        <div className={cn("space-y-2", className)}>
            <label className="block text-sm font-medium text-text-main">
                {label}
            </label>

            {!file ? (
                <div
                    className={cn(
                        "relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors bg-surface hover:bg-background/50",
                        dragActive ? "border-primary bg-primary/5" : "border-border"
                    )}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-3 text-text-muted" />
                        <p className="mb-1 text-sm text-text-muted">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-text-muted">
                            PDF or DOCX (MAX. 50MB)
                        </p>
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        className="hidden"
                        accept={accept}
                        onChange={handleChange}
                    />
                </div>
            ) : (
                <div className="relative flex items-center p-3 border border-border rounded-lg bg-surface">
                    <div className="p-2 mr-3 bg-primary/10 rounded-md">
                        <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-main truncate">
                            {file.name}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={removeFile}
                        className="p-1 ml-2 text-text-muted rounded-full hover:bg-background hover:text-error transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {helperText && (
                <p className="text-xs text-text-muted">
                    {helperText}
                </p>
            )}
        </div>
    );
}
