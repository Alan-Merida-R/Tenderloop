import React from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  FileBox, 
  FileImage, 
  FileArchive, 
  FileCode, 
  File as FileIcon, 
  Folder, 
  Box,
  Mail
} from 'lucide-react';

export const getFileIcon = (extension: string | undefined, isDirectory: boolean) => {
  const size = "w-5 h-5";
  if (isDirectory) return <Folder className={`${size} text-blue-500 fill-blue-500/20`} />;
  
  const ext = (extension || '').toLowerCase();
  
  if (ext === 'msg')
    return <Mail className={`${size} text-blue-500`} />;

  if (['xlsx', 'xlsm', 'xls', 'csv'].includes(ext)) 
    return <FileSpreadsheet className={`${size} text-emerald-600`} />;
  
  if (['docx', 'doc', 'rtf'].includes(ext)) 
    return <FileText className={`${size} text-blue-600`} />;
  
  if (['pptx', 'ppt'].includes(ext)) 
    return <FileBox className={`${size} text-orange-600`} />;
  
  if (ext === 'pdf') 
    return <FileText className={`${size} text-red-600`} />;
  
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) 
    return <FileImage className={`${size} text-purple-600`} />;
  
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) 
    return <FileArchive className={`${size} text-amber-600`} />;
  
  if (['dwg', 'dxf'].includes(ext)) 
    return <Box className={`${size} text-indigo-600`} />;
  
  if (['txt', 'json', 'js', 'ts', 'html', 'css', 'md'].includes(ext)) 
    return <FileCode className={`${size} text-slate-500`} />;
  
  return <FileIcon className={`${size} text-slate-400`} />;
};