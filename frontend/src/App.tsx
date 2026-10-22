import { lazy } from "react";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router-dom";
import { AppLayout } from "./modules/shell";

const HomePage = lazy(() => import("./routes/HomePage"));
const DashboardPage = lazy(() => import("./routes/DashboardPage"));
const DashboardsPage = lazy(() => import("./routes/DashboardsPage"));
const SharedPage = lazy(() => import("./routes/SharedPage"));
const TvPage = lazy(() => import("./routes/TvPage"));
const ExplorePage = lazy(() => import("./routes/ExplorePage"));
const MapsPage = lazy(() => import("./routes/MapsPage"));
const PollingPlacePage = lazy(() => import("./routes/PollingPlacePage"));
const PollingSectionPage = lazy(() => import("./routes/PollingSectionPage"));
const CandidatesPage = lazy(() => import("./routes/CandidatesPage"));
const CandidatePage = lazy(() => import("./routes/CandidatePage"));
const EventsPage = lazy(() => import("./routes/EventsPage"));
const AlertsPage = lazy(() => import("./routes/AlertsPage"));
const AccountPage = lazy(() => import("./routes/AccountPage"));
const AdminPage = lazy(() => import("./routes/AdminPage"));
const NotFoundPage = lazy(() => import("./routes/NotFoundPage"));

/** The screens; tests build a memory router from the same list (`tests/helpers/screen.tsx`). */
export const routes: RouteObject[] = [
  { path: "/p/:token", element: <SharedPage /> },
  { path: "/tv", element: <TvPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "paineis", element: <DashboardsPage /> },
      { path: "paineis/:id", element: <DashboardPage /> },
      { path: "explorar", element: <ExplorePage /> },
      { path: "explorar/:nivel", element: <ExplorePage /> },
      { path: "explorar/:nivel/:id", element: <ExplorePage /> },
      { path: "mapas", element: <MapsPage /> },
      { path: "locais/:id", element: <PollingPlacePage /> },
      { path: "secoes/:id", element: <PollingSectionPage /> },
      { path: "secoes/:uf/:mun/:zona/:secao", element: <PollingSectionPage /> },
      { path: "candidatos", element: <CandidatesPage /> },
      { path: "candidatos/:sqcand", element: <CandidatePage /> },
      { path: "eventos", element: <EventsPage /> },
      { path: "alertas", element: <AlertsPage /> },
      { path: "conta", element: <AccountPage /> },
      { path: "entrar", element: <Navigate to="/conta" replace /> },
      { path: "admin", element: <AdminPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const routerFuture = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
};

const router = createBrowserRouter(routes, { future: routerFuture });

export default function App() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
