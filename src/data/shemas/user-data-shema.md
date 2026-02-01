# User Profile Data Schema

This document describes the data structure used to represent a user profile in the app.  
Each profile is a **single JSON object**. A collection of users is represented as an array of these objects.

The schema is intentionally simple and human-readable, similar to a dating-profile format.

---

## User Profile Object

```json
{
  "name": "string",
  "age": 18,
  "hometown": "string",
  "interestOptions": ["string"],
  "interestFreeText": "string",
  "description": "string",
  "photoUrl": "string"
}
```

---

## Example

```
{
  "name": "Maya",
  "age": 22,
  "hometown": "Boston, MA",
  "interestOptions": ["coffee", "museums", "photography", "walking"],
  "interestFreeText": "Film photography, quiet cafés, and wandering around new neighborhoods.",
  "description": "Low-key, observant, and always down for a good conversation.",
  "photoUrl": "https://images.unsplash.com/photo-1524504388940-b1c1722653e1"
}
```