import React, { useState, Suspense, lazy, useEffect, useRef } from "react";

import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import app, { auth, db, logActivity } from "./config/firebase";
import { addDoc, collection, doc, getDoc, serverTimestamp, query, collectionGroup, where, limit, getDocs } from "firebase/firestore";
import { logComplianceEvent } from "./services/complianceAudit";
import LoggedOutView from "./components/LoggedOutView";

// Basis Componenten
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import LoginView from "./components/LoginView";
import PortalView from "./components/PortalView";
import ProfileView from "./components/ProfileView";
import ProductSearchView from "./components/products/ProductSearchView";
import ForcePasswordChangeView from "./components/ForcePasswordChangeView";
import GodModeBootstrap from "./components/admin/GodModeBootstrap";


// Notification System
import { NotificationProvider } from "./contexts/NotificationContext";
import { BackgroundTaskProvider } from "./contexts/BackgroundTaskContext";
import ToastContainer from "./components/notifications/ToastContainer";
import ConfirmDialog from "./components/notifications/ConfirmDialog";
import BackgroundTaskOverlay from "./components/notifications/BackgroundTaskOverlay";
import ProgressToast from "./components/digitalplanning/ProgressToast";
import PrintQueueAutoProcessor from "./components/printer/PrintQueueAutoProcessor";
import NetworkObserver from "./components/NetworkObserver";
import PrintQueuePinger from "./components/PrintQueuePinger";
import AutoLogoutManager from "./components/AutoLogoutManager";

// Hooks
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useSettingsData } from "./hooks/useSettingsData";
import { useMessages } from "./hooks/useMessages";

import { usePresence } from "./hooks/usePresence";
import { checkFeature } from "./hooks/useHasFeature";
import { useScreenOrientationLock } from "./hooks/useScreenOrientationLock";
import { useGlobalSearch } from "./hooks/useGlobalSearch";
import { PATHS, getPathString } from "./config/dbPaths";

// Safe Lazy Loader with automatic retry and reload fallback for Vite HMR
const safeLazy = <T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) =>
  lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      console.warn("Retrying dynamic module import after Vite HMR update...", error);
      await new Promise((r) => setTimeout(r, 300));
      try {
        return await importFn();
      } catch (err2) {
        if (typeof window !== "undefined" && !sessionStorage.getItem("vite_lazy_reload")) {
          sessionStorage.setItem("vite_lazy_reload", "true");
          window.location.reload();
        }
        throw err2;
      }
    }
  });

// Lazy Loading Modules
const AdminDashboard = safeLazy(() => import("./components/admin/AdminDashboard"));
const AdminMessagesView = safeLazy(() => import("./components/admin/AdminMessagesView"));
const DigitalPlanningHub = safeLazy(() => import("./components/digitalplanning/DigitalPlanningHub"));
const MobileScanner = safeLazy(() => import("./components/digitalplanning/MobileScanner"));
const ShopFloorMobileApp = safeLazy(() => import("./components/planning/ShopFloorMobileApp"));
const CalculatorView = safeLazy(() => import("./components/CalculatorView"));
const AiAssistantView = safeLazy(() => import("./components/ai/AiAssistantView"));
const AdminLogView = safeLazy(() => import("./components/admin/AdminLogView"));
const QCHub = safeLazy(() => import("./components/qc/QCHub"));
const PrintQueueAdminView = safeLazy(() => import("./components/printer/PrintQueueAdminView"));
const WM18RobotManagerView = safeLazy(() => import("./components/admin/WM18RobotManagerView"));
const ProductDossierModal = lazy(() => import("./components/digitalplanning/modals/ProductDossierModal"));
const TeamleaderOrderDetailModal = lazy(() => import("./components/digitalplanning/modals/TeamleaderOrderDetailModal"));
const MTPresentation = lazy(() =>
  import("./components/MTPresentation").then((module) => ({ default: module.MTPresentation }))
);
const TeamleaderPresentation = lazy(() =>
  import("./components/TeamleaderPresentation")
);

/**
 * App.jsx V18.0 - Responsive Design
 * + Mobile menu state management
 * + Password change flow
 */
const App = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const {
    globalSearchLoading,
    globalDossierProduct,
    globalOrderDetail,
    globalOrders,
    handleGlobalSearch,
    clearGlobalSearchState,
  } = useGlobalSearch();

  // Data fetching via Hooks
  const { user, isAdmin, role, loading: authLoading } = useAdminAuth();
  const canAccessPrinters =
    checkFeature(user, "printer_center") || checkFeature(user, "digital_planning");
  const enableGlobalPrintQueueAutoProcessor = !pathname.startsWith("/printer-queue");
  const firebaseUser = user as any;
  const { generalConfig } = useSettingsData(firebaseUser, { mode: "minimal" });
  useMessages(firebaseUser);
  const logoUrl = typeof generalConfig?.logoUrl === "string" ? generalConfig.logoUrl : undefined;
  const appName = typeof generalConfig?.appName === "string" ? generalConfig.appName : undefined;

  // Active presence tracking (ISO 27001)
  usePresence();

  // Conditionele schermrotatie: lock mobiel/scanners (<=768px) op portrait, tablets vrij
  useScreenOrientationLock();

  // Check of gebruiker wachtwoord moet wijzigen
  useEffect(() => {
    if (!user?.uid) {
      setRequiresPasswordChange(false);
      return;
    }

    const checkPasswordChange = async () => {
      try {
        const userDoc = await getDoc(doc(db, `${getPathString(PATHS.USERS)}/${user.uid}`));
        setRequiresPasswordChange(Boolean(userDoc.exists() && userDoc.data()?.requirePasswordChange));
      } catch (err) {
        console.error("Error checking password change:", err);
      }
    };

    checkPasswordChange();
  }, [user?.uid]);



  const handleLogin = async (email: string, password: string) => {
    setLoginError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await logComplianceEvent(userCredential.user.uid, "LOGIN", {
        email,
        method: "email",
        success: true,
      });
      navigate("/");
    } catch (err: any) {
      console.error("Login fout:", err);
      await logComplianceEvent("system", "LOGIN_FAILED", {
        email,
        reason: err?.code || "unknown",
        success: false,
      });
      
      let errorMessage = "E-mail of wachtwoord onjuist.";
      
      if (err.code === "auth/user-not-found") {
        errorMessage = "Geen account gevonden met dit e-mailadres.";
      } else if (err.code === "auth/wrong-password") {
        errorMessage = "Onjuist wachtwoord.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Ongeldig e-mailadres.";
      } else if (err.code === "auth/user-disabled") {
        errorMessage = "Dit account is uitgeschakeld.";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Te veel pogingen. Probeer later opnieuw.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Netwerkfout. Controleer je internetverbinding.";
      }
      
      setLoginError(errorMessage);
    }
  };

  const submitSearch = (queryStr: string) => {
    handleGlobalSearch(queryStr, () => setSearchQuery(""));
  };


  if (authLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-blue-400" size={48} />
        <p className="text-white font-black uppercase tracking-[0.3em] text-[10px] mt-4 italic">
          Identiteit controleren...
        </p>
      </div>
    );
  }

  if (pathname === "/presentation") {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen w-full items-center justify-center bg-slate-950">
            <Loader2 className="animate-spin text-blue-400" size={48} />
          </div>
        }
      >
        <MTPresentation />
      </Suspense>
    );
  }

  if (pathname === "/presentation-teamleaders") {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen w-full items-center justify-center bg-slate-950">
            <Loader2 className="animate-spin text-blue-400" size={48} />
          </div>
        }
      >
        <TeamleaderPresentation />
      </Suspense>
    );
  }

  // Check for specialized bootstrapping view (Orphaned Admin)
  const bootstrapAdminUid = import.meta.env.VITE_BOOTSTRAP_ADMIN_UID;
  let content;

  if (user?.uid === bootstrapAdminUid && role === "guest") {
    content = <GodModeBootstrap />;
  } else if (!user && !authLoading) {
    content = <LoginView onLogin={handleLogin} externalError={loginError} logoUrl={logoUrl} appName={appName} />;
  } else if (role === "guest") {
    content = <LoginView onLogin={handleLogin} externalError={loginError} logoUrl={logoUrl} appName={appName} />;
  } else if (requiresPasswordChange) {
    content = (
      <ForcePasswordChangeView 
        user={auth.currentUser as any} 
        onComplete={() => setRequiresPasswordChange(false)} 
      />
    );
  } else {
    content = (
      <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden text-left relative">
        <Header
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearchSubmit={submitSearch}
          isSearching={globalSearchLoading}
          logoUrl={logoUrl}
          appName={appName}
          onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        <div className="flex-1 flex overflow-hidden relative md:mt-0 pt-16 md:pt-0">
          <Sidebar
            user={user}
            isAdmin={isAdmin}
            onLogout={async () => {
              if (user) {
                await logActivity(user.uid, "LOGOUT", `Gebruiker uitgelogd: ${user.email}`);
              }
              await signOut(auth);
              navigate("/login");
            }}
            isMobileMenuOpen={isMobileMenuOpen}
            onMobileMenuClose={() => setIsMobileMenuOpen(false)}
          />

          <main className="flex-1 flex flex-col overflow-hidden relative md:pl-16">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center bg-white">
                  <Loader2 className="animate-spin text-blue-500" />
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<PortalView />} />
                <Route path="/portal" element={<PortalView />} />
                <Route path="/profile" element={<ProfileView />} />
                <Route path="/products" element={<ProductSearchView showFilters={false} setShowFilters={() => {}} />} />
                <Route path="/planning/*" element={<DigitalPlanningHub />} />
                <Route path="/scanner" element={<MobileScanner onScan={() => {}} onClose={() => navigate(-1)} />} />
                <Route path="/inspector" element={<ShopFloorMobileApp />} />
                <Route path="/calculator" element={<CalculatorView />} />
                <Route path="/assistant" element={<AiAssistantView />} />
                <Route path="/qc/*" element={<QCHub />} />
                <Route path="/messages" element={<AdminMessagesView user={user as any} />} />
                <Route
                  path="/printer-queue"
                  element={canAccessPrinters ? <PrintQueueAdminView /> : <Navigate to="/" replace />}
                />
                <Route path="/admin/*" element={<AdminDashboard />} />
                <Route path="/wm18-robot" element={<WM18RobotManagerView />} />
                <Route path="/logs" element={<AdminLogView />} />
                <Route path="/login" element={<LoginView onLogin={handleLogin} externalError={loginError} logoUrl={logoUrl} appName={appName} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>



        <Suspense fallback={null}>
          {globalDossierProduct && (
            <ProductDossierModal
              isOpen={!!globalDossierProduct}
              product={globalDossierProduct}
              orders={globalOrders}
              onClose={clearGlobalSearchState}
            />
          )}
          {globalOrderDetail && (
            <TeamleaderOrderDetailModal
              order={globalOrderDetail}
              onClose={clearGlobalSearchState}
            />
          )}
        </Suspense>
      </div>
    );
  }

  return (
    <NotificationProvider>
        <BackgroundTaskProvider>
          <ToastContainer />
          <ConfirmDialog />
          <BackgroundTaskOverlay />
          <ProgressToast />
          <NetworkObserver userEmail={user?.email} />
          <PrintQueuePinger enabled={Boolean(user)} />
          <AutoLogoutManager isLoggedIn={!!user} />
          <PrintQueueAutoProcessor enabled={Boolean(user && role !== "guest" && enableGlobalPrintQueueAutoProcessor)} />
          {content}
        </BackgroundTaskProvider>
    </NotificationProvider>
  );
};

export default App;
