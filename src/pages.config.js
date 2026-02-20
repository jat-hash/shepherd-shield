/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Assignments from './pages/Assignments';
import AutoRotation from './pages/AutoRotation';
import Communications from './pages/Communications';
import Dashboard from './pages/Dashboard';
import EquipmentInventory from './pages/EquipmentInventory';
import Incidents from './pages/Incidents';
import Positions from './pages/Positions';
import Profile from './pages/Profile';
import SOPLibrary from './pages/SOPLibrary';
import SpecialEvents from './pages/SpecialEvents';
import WatchList from './pages/WatchList';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Assignments": Assignments,
    "AutoRotation": AutoRotation,
    "Communications": Communications,
    "Dashboard": Dashboard,
    "EquipmentInventory": EquipmentInventory,
    "Incidents": Incidents,
    "Positions": Positions,
    "Profile": Profile,
    "SOPLibrary": SOPLibrary,
    "SpecialEvents": SpecialEvents,
    "WatchList": WatchList,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};