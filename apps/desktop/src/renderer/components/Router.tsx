import { Navigate, Route, Routes } from 'react-router'
import Collection from '../pages/Collection.js'
import Home from '../pages/Home.js'
import Library from '../pages/Library.js'
import Settings from '../pages/Settings.js'
import Layout from './Layout.js'

export default function Router() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/collections/:collectionId" element={<Collection />} />
        <Route
          path="/recents"
          element={<Navigate to="/collections/recents" replace />}
        />
        <Route
          path="/favorites"
          element={<Navigate to="/collections/favorites" replace />}
        />
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/libraries/:libraryId" element={<Library />} />
      </Route>
    </Routes>
  )
}
