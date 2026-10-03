import { lazy } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";

const HomePage = lazy(() => import("./pages/HomePage"));
const PainelPage = lazy(() => import("./pages/PainelPage"));
const PaineisPage = lazy(() => import("./pages/PaineisPage"));
const SharedPage = lazy(() => import("./pages/SharedPage"));
const TvPage = lazy(() => import("./pages/TvPage"));
const ExplorarPage = lazy(() => import("./pages/ExplorarPage"));
const MapasPage = lazy(() => import("./pages/MapasPage"));
const LocalPage = lazy(() => import("./pages/LocalPage"));
const SecaoPage = lazy(() => import("./pages/SecaoPage"));
const CandidatosPage = lazy(() => import("./pages/CandidatosPage"));
const CandidatoPage = lazy(() => import("./pages/CandidatoPage"));
const EventosPage = lazy(() => import("./pages/EventosPage"));
const AlertasPage = lazy(() => import("./pages/AlertasPage"));
const ContaPage = lazy(() => import("./pages/ContaPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const router = createBrowserRouter([
  { path: "/p/:token", element: <SharedPage /> },
  { path: "/tv", element: <TvPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "paineis", element: <PaineisPage /> },
      { path: "paineis/:id", element: <PainelPage /> },
      { path: "explorar", element: <ExplorarPage /> },
      { path: "explorar/:nivel", element: <ExplorarPage /> },
      { path: "explorar/:nivel/:id", element: <ExplorarPage /> },
      { path: "mapas", element: <MapasPage /> },
      { path: "locais/:id", element: <LocalPage /> },
      { path: "secoes/:id", element: <SecaoPage /> },
      { path: "secoes/:uf/:mun/:zona/:secao", element: <SecaoPage /> },
      { path: "candidatos", element: <CandidatosPage /> },
      { path: "candidatos/:sqcand", element: <CandidatoPage /> },
      { path: "eventos", element: <EventosPage /> },
      { path: "alertas", element: <AlertasPage /> },
      { path: "conta", element: <ContaPage /> },
      { path: "entrar", element: <Navigate to="/conta" replace /> },
      { path: "admin", element: <AdminPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
