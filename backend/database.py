# database.py - MongoDB connection and schemas

from pymongo import MongoClient
from datetime import datetime
import os
from bson import ObjectId

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017/")
client = MongoClient(MONGO_URL)
db = client["food_freshness_tracker"]

# Collections
users_collection = db["users"]
food_items_collection = db["food_items"]
analytics_collection = db["analytics"]

# Create indexes for better performance
try:
    users_collection.create_index("email", unique=True)
    food_items_collection.create_index([("user_id", 1), ("expiry_date", 1)])
    food_items_collection.create_index([("user_id", 1), ("consumed", 1)])
    print("Database indexes created successfully")
except Exception as e:
    print(f"Index creation error (may already exist): {e}")

# Schema examples (MongoDB is schema-less, but here's the structure)

# User Schema
"""
{
    "_id": ObjectId,
    "name": str,
    "email": str,
    "password": str (hashed),
    "created_at": datetime,
    "is_admin": bool
}
"""

# Food Item Schema
"""
{
    "_id": ObjectId,
    "user_id": ObjectId or int,
    "name": str,
    "quantity": int,
    "category": str,
    "purchase_date": datetime,
    "expiry_date": datetime,
    "consumed": bool,
    "consumed_date": datetime (optional),
    "price": float (optional),
    "source": str (e.g., "walmart", "manual"),
    "created_at": datetime
}
"""

# Analytics Schema
"""
{
    "_id": ObjectId,
    "user_id": ObjectId or int,
    "date": datetime,
    "total_items": int,
    "consumed_items": int,
    "wasted_items": int,
    "total_value": float,
    "wasted_value": float,
    "categories": {
        "dairy": {"total": int, "wasted": int},
        "produce": {"total": int, "wasted": int},
        ...
    }
}
"""

# Helper functions
def get_user_by_email(email):
    """Find user by email address"""
    return users_collection.find_one({"email": email})

def get_user_by_id(user_id):
    """Find user by ID (handles both ObjectId and int)"""
    if isinstance(user_id, int):
        return users_collection.find_one({"id": user_id})
    else:
        return users_collection.find_one({"_id": ObjectId(user_id)})

def create_user(name, email, password_hash):
    """Create new user account"""
    user_data = {
        "name": name,
        "email": email,
        "password": password_hash,
        "created_at": datetime.now(),
        "is_admin": False
    }
    result = users_collection.insert_one(user_data)
    return result.inserted_id

def add_food_item(user_id, item_data):
    """Add new food item to inventory"""
    # Parse dates if they're strings
    if isinstance(item_data.get("purchase_date"), str):
        purchase_date = datetime.strptime(item_data["purchase_date"], "%Y-%m-%d")
    else:
        purchase_date = item_data.get("purchase_date", datetime.now())
    
    if isinstance(item_data.get("expiry_date"), str):
        expiry_date = datetime.strptime(item_data["expiry_date"], "%Y-%m-%d")
    else:
        expiry_date = item_data["expiry_date"]
    
    food_item = {
        "user_id": user_id,
        "name": item_data["name"],
        "quantity": item_data.get("quantity", 1),
        "category": item_data.get("category", "other"),
        "purchase_date": purchase_date,
        "expiry_date": expiry_date,
        "consumed": False,
        "price": item_data.get("price", 0),
        "source": item_data.get("source", "manual"),
        "created_at": datetime.now()
    }
    
    result = food_items_collection.insert_one(food_item)
    return result.inserted_id

def get_user_items(user_id, include_consumed=False):
    """Get all items for a user"""
    query = {"user_id": user_id}
    if not include_consumed:
        query["consumed"] = False
    
    items = list(food_items_collection.find(query).sort("expiry_date", 1))
    
    # Convert ObjectId to string for JSON serialization
    for item in items:
        item["_id"] = str(item["_id"])
        item["id"] = item["_id"]  # Add id field for compatibility
    
    return items

def get_expiring_items(user_id, days=3):
    """Get items expiring within specified days"""
    from datetime import timedelta
    expiry_threshold = datetime.now() + timedelta(days=days)
    
    query = {
        "user_id": user_id,
        "consumed": False,
        "expiry_date": {"$lte": expiry_threshold}
    }
    
    items = list(food_items_collection.find(query).sort("expiry_date", 1))
    
    # Convert ObjectId to string
    for item in items:
        item["_id"] = str(item["_id"])
        item["id"] = item["_id"]
    
    return items

def mark_item_consumed(item_id, user_id=None):
    """Mark an item as consumed"""
    query = {"_id": ObjectId(item_id)}
    if user_id:
        query["user_id"] = user_id
    
    update = {
        "$set": {
            "consumed": True,
            "consumed_date": datetime.now()
        }
    }
    
    result = food_items_collection.update_one(query, update)
    return result.modified_count > 0

def delete_item(item_id, user_id=None):
    """Delete an item from inventory"""
    query = {"_id": ObjectId(item_id)}
    if user_id:
        query["user_id"] = user_id
    
    result = food_items_collection.delete_one(query)
    return result.deleted_count > 0

def calculate_waste_analytics(user_id):
    """Calculate waste statistics for a user"""
    items = list(food_items_collection.find({"user_id": user_id}))
    
    total = len(items)
    consumed = sum(1 for item in items if item["consumed"])
    wasted = sum(1 for item in items if not item["consumed"] and item["expiry_date"] < datetime.now())
    
    # Calculate by category
    categories = {}
    for item in items:
        category = item.get("category", "other")
        if category not in categories:
            categories[category] = {"total": 0, "wasted": 0, "consumed": 0}
        
        categories[category]["total"] += 1
        if item["consumed"]:
            categories[category]["consumed"] += 1
        elif item["expiry_date"] < datetime.now():
            categories[category]["wasted"] += 1
    
    return {
        "total_items": total,
        "consumed_items": consumed,
        "wasted_items": wasted,
        "waste_percentage": (wasted / total * 100) if total > 0 else 0,
        "categories": categories
    }

def save_analytics_snapshot(user_id):
    """Save current analytics snapshot"""
    analytics = calculate_waste_analytics(user_id)
    analytics["user_id"] = user_id
    analytics["date"] = datetime.now()
    
    analytics_collection.insert_one(analytics)
    return analytics

# Test database connection
if __name__ == "__main__":
    try:
        # Test connection
        client.server_info()
        print("✅ MongoDB connection successful!")
        print(f"📊 Database: {db.name}")
        print(f"📁 Collections: {db.list_collection_names()}")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        print("Make sure MongoDB is running on localhost:27017")
