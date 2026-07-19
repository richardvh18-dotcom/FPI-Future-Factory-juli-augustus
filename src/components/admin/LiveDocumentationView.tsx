import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, FileText } from 'lucide-react';

import projectStructureMd from '../../../docs/01_PROJECTSTRUCTUUR_EN_ARCHITECTUUR.md?raw';
import devGuideMd from '../../../docs/02_HANDLEIDING_ONTWIKKELAARS.md?raw';
import featuresMd from '../../../docs/03_FEATURES_EN_MODULES.md?raw';
import deployMd from '../../../docs/04_DEPLOYMENT_EN_OPERATIONS.md?raw';
import ideEnvMd from '../../../docs/05_WERKOMGEVINGEN_IDE.md?raw';
import aiKbMd from '../../../docs/06_AI_KNOWLEDGE_BASE.md?raw';
import convSummaryMd from '../../../docs/CONVERSATION_SUMMARY.md?raw';
import restoreSopMd from '../../../docs/RESTORE_SOP.md?raw';
import visionMd from '../../../docs/VISION.md?raw';
import printRouteMd from '../../../docs/PRINTER_ROUTING_SETUP.md?raw';
import printParityMd from '../../../docs/PRINT_PREVIEW_PARITY_VALIDATION.md?raw';
import glassCalcMd from '../../../docs/GLASS_CALCULATION_SHEET_MAPPING.md?raw';

const docsGlob: Record<string, string> = {
  '../../../docs/01_PROJECTSTRUCTUUR_EN_ARCHITECTUUR.md': projectStructureMd,
  '../../../docs/02_HANDLEIDING_ONTWIKKELAARS.md': devGuideMd,
  '../../../docs/03_FEATURES_EN_MODULES.md': featuresMd,
  '../../../docs/04_DEPLOYMENT_EN_OPERATIONS.md': deployMd,
  '../../../docs/05_WERKOMGEVINGEN_IDE.md': ideEnvMd,
  '../../../docs/06_AI_KNOWLEDGE_BASE.md': aiKbMd,
  '../../../docs/CONVERSATION_SUMMARY.md': convSummaryMd,
  '../../../docs/RESTORE_SOP.md': restoreSopMd,
  '../../../docs/VISION.md': visionMd,
  '../../../docs/PRINTER_ROUTING_SETUP.md': printRouteMd,
  '../../../docs/PRINT_PREVIEW_PARITY_VALIDATION.md': printParityMd,
  '../../../docs/GLASS_CALCULATION_SHEET_MAPPING.md': glassCalcMd
};

export const LiveDocumentationView = ({ t }: { t: any }) => {
  const docEntries = Object.entries(docsGlob).map(([path, content]) => {
    const filename = path.split('/').pop() || '';
    return { path, filename, content: content as string };
  });

  docEntries.sort((a, b) => a.filename.localeCompare(b.filename));
  const [selectedDoc, setSelectedDoc] = useState(docEntries[0]);

  return (
    <div className="flex h-full w-full bg-slate-50">
      
      {/* SIDEBAR: Documentatielijst */}
      <div className="w-1/4 min-w-[250px] border-r border-slate-200 bg-white flex flex-col h-full overflow-y-auto">
        <div className="p-6 pb-2 border-b border-slate-100">
          <h2 className="text-lg font-black flex items-center gap-2 text-slate-800">
            <BookOpen className="text-blue-600" /> Live Documentatie
          </h2>
          <p className="text-xs text-slate-500 mt-1">Automatisch gesynchroniseerd met <code className="bg-slate-100 px-1 rounded text-slate-700">docs/</code></p>
        </div>
        
        <div className="p-4 flex flex-col gap-1">
          {docEntries.map(doc => {
            const isSelected = selectedDoc?.path === doc.path;
            return (
              <button
                key={doc.path}
                onClick={() => setSelectedDoc(doc)}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left text-sm font-medium ${
                  isSelected 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                    : 'bg-transparent text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileText size={16} className={isSelected ? 'text-white' : 'text-slate-400'} />
                <span className="truncate">{doc.filename}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT: Markdown Weergave */}
      <div className="w-3/4 flex-1 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 p-8 lg:p-12">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl p-8 lg:p-12 shadow-sm border border-slate-100">
          {selectedDoc ? (
            <article className="prose prose-slate prose-blue max-w-none 
              prose-headings:font-black prose-h1:text-4xl prose-h2:text-2xl 
              prose-a:text-blue-600 hover:prose-a:text-blue-500
              prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded prose-code:text-blue-800
              prose-pre:bg-slate-900 prose-pre:text-slate-100
              prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:not-italic
              prose-img:rounded-xl prose-img:shadow-md
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selectedDoc.content}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <FileText size={48} className="mb-4 opacity-50" />
              <p>Geen documentatie bestanden gevonden in <code className="bg-slate-100 px-1 rounded text-slate-500">docs/</code></p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
