import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, FileText, Folder, ChevronDown, ChevronRight, FileArchive, Search, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Load ALL markdown files from docs/ (including all subdirectories)
const globbedDocs = import.meta.glob('../../../docs/**/*.md', { query: '?raw', import: 'default', eager: true });

type DocNode = {
  name: string;
  path: string;
  rawPath: string;
  content: string;
  isDirectory: false;
};

type DirNode = {
  name: string;
  isDirectory: true;
  children: Record<string, DocNode | DirNode>;
};

export const LiveDocumentationView = ({ t }: { t: any }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'architecture': true, // Auto-expand important folders
    'root': true
  });
  const [selectedDoc, setSelectedDoc] = useState<DocNode | null>(null);

  // 1. Build the Tree
  const fileTree = useMemo(() => {
    const root: DirNode = { name: 'root', isDirectory: true, children: {} };
    let firstDoc: DocNode | null = null;

    Object.entries(globbedDocs).forEach(([path, content]) => {
      const relativePath = path.replace('../../../docs/', '');
      const parts = relativePath.split('/');
      
      let currentLevel = root;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        
        if (isFile) {
          const doc: DocNode = {
            name: part.replace('.md', '').replace(/_/g, ' '),
            path: path,
            rawPath: relativePath,
            content: content as string,
            isDirectory: false
          };
          currentLevel.children[part] = doc;
          if (!firstDoc && !relativePath.includes('archief/')) firstDoc = doc; // Default doc
        } else {
          if (!currentLevel.children[part]) {
            currentLevel.children[part] = {
              name: part,
              isDirectory: true,
              children: {}
            };
          }
          currentLevel = currentLevel.children[part] as DirNode;
        }
      }
    });
    
    return { root, firstDoc };
  }, []);

  // Set default selection once
  React.useEffect(() => {
    if (!selectedDoc && fileTree.firstDoc) {
      setSelectedDoc(fileTree.firstDoc);
    }
  }, [fileTree, selectedDoc]);

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const renderTree = (node: DirNode | DocNode, level: number = 0) => {
    if (!node.isDirectory) {
      // It's a file
      if (searchTerm && !node.name.toLowerCase().includes(searchTerm.toLowerCase())) return null;
      
      const isSelected = selectedDoc?.path === node.path;
      return (
        <button
          key={node.path}
          onClick={() => setSelectedDoc(node)}
          className={`w-full flex items-center gap-3 py-2 px-3 rounded-lg transition-all text-sm font-medium ${
            isSelected 
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' 
              : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
          }`}
          style={{ paddingLeft: `${level * 12 + 12}px` }}
        >
          <FileText size={16} className={isSelected ? 'text-white' : 'text-slate-400'} />
          <span className="truncate text-left">{node.name.toUpperCase()}</span>
        </button>
      );
    }

    // It's a directory
    // Skip root node render, just render children
    if (node.name === 'root') {
      return Object.values(node.children)
        .sort((a, b) => {
           // Directories first, then files
           if (a.isDirectory && !b.isDirectory) return -1;
           if (!a.isDirectory && b.isDirectory) return 1;
           return a.name.localeCompare(b.name);
        })
        .map(child => renderTree(child, level));
    }

    const isExpanded = expandedFolders[node.name] !== false; // default to expanded unless false
    const hasVisibleChildren = Object.values(node.children).some(child => {
      if (!child.isDirectory && searchTerm && !child.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

    if (searchTerm && !hasVisibleChildren) return null;

    const isArchief = node.name.toLowerCase() === 'archief';

    return (
      <div key={node.name} className="mb-1">
        <button
          onClick={() => toggleFolder(node.name)}
          className="w-full flex items-center gap-2 py-2 px-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-bold text-sm"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          {isArchief ? <FileArchive size={16} className="text-amber-500" /> : <Folder size={16} className="text-blue-500" />}
          <span className="capitalize tracking-wide">{node.name}</span>
        </button>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden flex flex-col gap-0.5 mt-1"
            >
              {Object.values(node.children)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(child => renderTree(child, level + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden font-sans">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-markdown-doc, #printable-markdown-doc * {
            visibility: visible;
          }
          #printable-markdown-doc {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .print-hide {
            display: none !important;
          }
        }
      `}</style>
      {/* SIDEBAR: Premium Glassmorphism Navigation */}
      <div className="w-1/4 min-w-[280px] max-w-[320px] bg-white/80 backdrop-blur-xl border-r border-slate-200/60 flex flex-col h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] print-hide">
        <div className="p-6 pb-4 border-b border-slate-100/80 bg-white/50">
          <h2 className="text-xl font-black flex items-center gap-3 text-slate-900 tracking-tight">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-inner shadow-blue-400/50">
              <BookOpen size={20} className="text-white" /> 
            </div>
            Engineering Portal
          </h2>
          <p className="text-xs text-slate-500 mt-2 font-medium">Live gesynchroniseerd met GitHub repo</p>
          
          <div className="mt-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Zoek in documentatie..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-100/50 border border-slate-200 text-sm rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
          </div>
        </div>
        
        <div className="p-3 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
          {renderTree(fileTree.root)}
        </div>
      </div>

      {/* CONTENT: Framer Motion Animated Markdown */}
      <div className="w-3/4 flex-1 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 relative">
        {/* Decorative background blur */}
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none print-hide" />
        
        <div className="p-8 lg:p-12 max-w-5xl mx-auto relative z-10 min-h-full flex flex-col">
          <AnimatePresence mode="wait">
            {selectedDoc ? (
              <motion.div
                id="printable-markdown-doc"
                key={selectedDoc.path}
                initial={{ opacity: 0, y: 15, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="bg-white rounded-3xl p-10 lg:p-14 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/80 ring-1 ring-slate-900/5 flex-1 print:border-none print:shadow-none print:ring-0 print:p-0 print:rounded-none"
              >
                <div className="mb-8 pb-6 border-b border-slate-100 flex items-center justify-between print-hide">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                    <FileText size={14} />
                    {selectedDoc.rawPath}
                  </div>
                  
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                  >
                    <Printer size={16} /> Export PDF / Print
                  </button>
                </div>
                
                <article className="prose prose-slate prose-blue max-w-none 
                  prose-headings:font-black prose-headings:tracking-tight 
                  prose-h1:text-4xl prose-h1:mb-8 prose-h1:text-slate-900
                  prose-h2:text-2xl prose-h2:mt-10 prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-3
                  prose-h3:text-xl
                  prose-a:text-blue-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline hover:prose-a:text-blue-700
                  prose-code:bg-slate-100/80 prose-code:text-indigo-600 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-[#0f172a] prose-pre:text-slate-50 prose-pre:shadow-xl prose-pre:rounded-2xl prose-pre:border prose-pre:border-slate-800
                  prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50/50 prose-blockquote:py-3 prose-blockquote:px-6 prose-blockquote:rounded-r-2xl prose-blockquote:not-italic prose-blockquote:text-slate-700
                  prose-img:rounded-2xl prose-img:shadow-lg prose-img:border prose-img:border-slate-200
                  prose-strong:text-slate-900
                  prose-ul:list-disc prose-ul:marker:text-blue-400
                  prose-ol:marker:text-blue-600 prose-ol:marker:font-bold
                  prose-th:bg-slate-50 prose-th:p-3 prose-th:rounded-t-lg
                  prose-td:p-3 prose-td:border-b prose-td:border-slate-100
                  leading-relaxed
                  print:prose-headings:text-black print:text-black print:prose-a:text-black print:prose-a:underline print:prose-pre:bg-slate-100 print:prose-pre:text-black print:prose-pre:border-slate-300 print:prose-pre:shadow-none print:prose-code:text-black
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedDoc.content}
                  </ReactMarkdown>
                </article>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-[60vh] text-slate-400"
              >
                <div className="p-6 bg-slate-100 rounded-full mb-6">
                  <BookOpen size={48} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-600 mb-2">Geen document geselecteerd</h3>
                <p className="text-sm">Selecteer een document uit de zijbalk om te beginnen.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
};
