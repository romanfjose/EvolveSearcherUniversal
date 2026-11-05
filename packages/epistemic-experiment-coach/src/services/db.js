import { doc, setDoc, getDocs, collection, query, where, deleteDoc } from "firebase/firestore";
import { db } from "./firebase-config.js";

/**
 * Saves or updates a journey in Firestore for the given user.
 * @param {string} userId - The authenticated user's ID.
 * @param {object} journey - The journey state object.
 */
export async function saveJourney(userId, journey) {
  if (!userId || !journey?.id) return;
  try {
    const journeyRef = doc(db, "journeys", journey.id);
    await setDoc(journeyRef, {
      ...journey,
      userId,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (error) {
    console.error("Error saving journey to Firestore:", error);
    throw error;
  }
}

/**
 * Fetches all journeys for a given user from Firestore, sorted by creation date.
 * @param {string} userId - The authenticated user's ID.
 * @returns {Promise<Array>} - List of journeys.
 */
export async function getUserJourneys(userId) {
  if (!userId) return [];
  try {
    const journeysRef = collection(db, "journeys");
    const q = query(journeysRef, where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    
    const list = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data());
    });
    
    // Sort locally by creation date ascending to avoid requiring a custom Firestore query index
    return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch (error) {
    console.error("Error getting journeys from Firestore:", error);
    throw error;
  }
}

/**
 * Deletes a journey from Firestore.
 * @param {string} journeyId - The ID of the journey to delete.
 */
export async function deleteJourney(journeyId) {
  if (!journeyId) return;
  try {
    const journeyRef = doc(db, "journeys", journeyId);
    await deleteDoc(journeyRef);
  } catch (error) {
    console.error("Error deleting journey from Firestore:", error);
    throw error;
  }
}

/**
 * Syncs local journeys (from guest mode/localStorage) to Firestore.
 * @param {string} userId - The authenticated user's ID.
 * @param {Array} localJourneys - List of journeys currently stored in localStorage.
 */
export async function syncLocalJourneys(userId, localJourneys) {
  if (!userId || !Array.isArray(localJourneys) || localJourneys.length === 0) return;
  try {
    const promises = localJourneys.map((journey) => saveJourney(userId, journey));
    await Promise.all(promises);
  } catch (error) {
    console.error("Error syncing local journeys to Firestore:", error);
  }
}
