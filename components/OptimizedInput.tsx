
import React, { useState, useEffect } from 'react';

interface OptimizedInputProps {
    value?: string | number;
    onChange: (val: any) => void;
    className?: string;
    placeholder?: string;
    autoFocus?: boolean;
    type?: string;
    step?: string;
    autoComplete?: string;
    id?: string;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    disabled?: boolean;
}

export const OptimizedInput = React.memo(({ value, onChange, className, placeholder, type = "text", step, autoFocus, autoComplete, id, onKeyDown, disabled }: OptimizedInputProps) => {
    const [localVal, setLocalVal] = useState(value || '');
    useEffect(() => { setLocalVal(value || ''); }, [value]);

    const handleSync = () => {
        if (!disabled && localVal !== value) {
            if (type === 'number') {
                onChange(parseFloat(localVal as string) || 0);
            } else {
                onChange(localVal);
            }
        }
    };

    return (
        <input 
            id={id}
            type={type}
            step={step}
            value={localVal}
            autoComplete={autoComplete}
            disabled={disabled}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={handleSync}
            onKeyDown={(e) => { 
                if (e.key === 'Enter') {
                    handleSync();
                    onKeyDown?.(e);
                } else {
                    onKeyDown?.(e);
                }
            }}
            className={className}
            placeholder={placeholder}
            autoFocus={autoFocus}
        />
    );
});

export const OptimizedTextArea = React.memo(({ value, onChange, className, placeholder, disabled }: any) => {
    const [localVal, setLocalVal] = useState(value || '');
    useEffect(() => { setLocalVal(value || ''); }, [value]);

    return (
        <textarea 
            value={localVal}
            disabled={disabled}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={() => { if (!disabled && localVal !== value) onChange(localVal); }}
            className={className}
            placeholder={placeholder}
        />
    );
});


export const DebouncedInput = React.memo(({ value, onChange, className, placeholder, autoFocus, type = "text" }: any) => {
    const [localVal, setLocalVal] = useState(value || '');
    useEffect(() => { setLocalVal(value || ''); }, [value]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (localVal !== value) onChange(localVal);
        }, 300);
        return () => clearTimeout(handler);
    }, [localVal, value, onChange]);

    return (
        <input 
            type={type}
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            className={className}
            placeholder={placeholder}
            autoFocus={autoFocus}
        />
    );
});
