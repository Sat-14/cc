# main.py - Complete Backend API

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from typing import List, Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import uvicorn
from datetime import timezone



app = FastAPI()

# Security
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "your-secret-key-here"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory databases (replace with MongoDB in production)
users_db = {}
inventory_db = {}
food_database = {
    "dairy": {"milk": 7, "yogurt": 14, "cheese": 30, "butter": 30},
    "produce": {"lettuce": 7, "tomatoes": 7, "apples": 14, "bananas": 5},
    "meat": {"chicken": 2, "beef": 3, "pork": 3, "fish": 2},
    "bakery": {"bread": 5, "bagels": 5, "cake": 3, "cookies": 14},
    "other": {"eggs": 21, "pasta": 365, "rice": 365, "cereal": 180}
}

# Models
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    token: str
    user_id: int
    name: str

class FoodItem(BaseModel):
    name: str
    quantity: int
    category: str
    purchase_date: str

class FoodItemResponse(BaseModel):
    id: int
    name: str
    quantity: int
    category: str
    purchase_date: str
    expiry_date: str
    consumed: bool = False

class InventoryResponse(BaseModel):
    items: List[FoodItemResponse]

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    print("Token received:", credentials.credentials)
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

def calculate_expiry_date(category: str, item_name: str, purchase_date: str) -> str:
    """Calculate expiry date based on food type and purchase date"""
    # Get default days for category
    days_to_add = 7  # default
    
    # Check if we have specific data for this item
    for cat, items in food_database.items():
        if cat == category.lower():
            # Check for exact match
            for food, days in items.items():
                if food.lower() in item_name.lower():
                    days_to_add = days
                    break
            else:
                # Use category default
                days_to_add = list(items.values())[0] if items else 7
            break
    
    # Calculate expiry date
    purchase = datetime.strptime(purchase_date, "%Y-%m-%d")
    expiry = purchase + timedelta(days=days_to_add)
    return expiry.strftime("%Y-%m-%d")

# Authentication Endpoints
@app.post("/register", response_model=dict)
async def register(user: UserRegister):
    """Create new user account"""
    if user.email in users_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    hashed_password = get_password_hash(user.password)
    user_id = len(users_db) + 1
    
    users_db[user.email] = {
        "id": user_id,
        "name": user.name,
        "email": user.email,
        "password": hashed_password
    }
    
    return {"message": "User registered successfully"}

@app.post("/login", response_model=TokenResponse)
async def login(user: UserLogin):
    """Authenticate user and return token"""
    db_user = users_db.get(user.email)
    
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    access_token = create_access_token(data={"sub": str(db_user["id"])})

    
    return {
        "token": access_token,
        "user_id": db_user["id"],
        "name": db_user["name"]
    }

# Inventory Management Endpoints
@app.get("/inventory/{user_id}", response_model=InventoryResponse)
async def get_inventory(user_id: int, current_user: int = Depends(verify_token)):
    """Get all user's current items"""
    if current_user != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    user_items = inventory_db.get(user_id, [])
    # Filter out consumed items
    active_items = [item for item in user_items if not item["consumed"]]
    
    return {"items": active_items}

@app.post("/inventory/{user_id}/add", response_model=FoodItemResponse)
async def add_item(user_id: int, item: FoodItem, current_user: int = Depends(verify_token)):
    """Add new item to inventory"""
    if current_user != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    if user_id not in inventory_db:
        inventory_db[user_id] = []
    
    # Calculate expiry date based on food type
    expiry_date = calculate_expiry_date(item.category, item.name, item.purchase_date)
    
    new_item = {
        "id": len(inventory_db[user_id]) + 1,
        "name": item.name,
        "quantity": item.quantity,
        "category": item.category,
        "purchase_date": item.purchase_date,
        "expiry_date": expiry_date,
        "consumed": False,
        "added_at": datetime.now().isoformat()
    }
    
    inventory_db[user_id].append(new_item)
    
    return new_item

@app.post("/inventory/{item_id}/consume")
async def mark_consumed(item_id: int, current_user: int = Depends(verify_token)):
    """Mark item as consumed"""
    # Find the item across all users (in production, use proper DB query)
    for user_id, items in inventory_db.items():
        for item in items:
            if item["id"] == item_id:
                if user_id != current_user:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied"
                    )
                item["consumed"] = True
                item["consumed_date"] = datetime.now().isoformat()
                return {"message": "Item marked as consumed"}
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Item not found"
    )

@app.delete("/inventory/{item_id}")
async def delete_item(item_id: int, current_user: int = Depends(verify_token)):
    """Remove item from inventory"""
    for user_id, items in inventory_db.items():
        for i, item in enumerate(items):
            if item["id"] == item_id:
                if user_id != current_user:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied"
                    )
                items.pop(i)
                return {"message": "Item deleted successfully"}
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Item not found"
    )

# Food Database Endpoints
@app.get("/foods/search")
async def search_foods(query: str):
    """Search available food items"""
    results = []
    
    for category, items in food_database.items():
        for food_name, expiry_days in items.items():
            if query.lower() in food_name.lower():
                results.append({
                    "name": food_name,
                    "category": category,
                    "typical_expiry_days": expiry_days
                })
    
    return {"results": results}

@app.get("/foods/{food_id}/expiry")
async def get_food_expiry(food_id: str):
    """Get typical expiry time for food type"""
    for category, items in food_database.items():
        if food_id.lower() in items:
            return {
                "food": food_id,
                "category": category,
                "typical_expiry_days": items[food_id.lower()]
            }
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Food item not found in database"
    )

# Walmart Integration (Mock endpoints for now)
@app.get("/walmart/search/{query}")
async def search_walmart(query: str, current_user: int = Depends(verify_token)):
    """Search Walmart products"""
    # Mock response - replace with actual Walmart API call
    mock_results = [
        {
            "id": "WM123",
            "name": f"{query} - Walmart Fresh",
            "price": 4.99,
            "category": "produce",
            "brand": "Great Value"
        },
        {
            "id": "WM124",
            "name": f"Organic {query}",
            "price": 6.99,
            "category": "produce",
            "brand": "Marketside"
        }
    ]
    
    return {"results": mock_results}

@app.post("/walmart/purchase")
async def add_walmart_purchase(
    product_id: str,
    quantity: int,
    user_id: int,
    current_user: int = Depends(verify_token)
):
    """Add purchased items from Walmart to inventory"""
    if current_user != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Mock implementation - would integrate with Walmart API
    # and automatically add items to inventory
    return {"message": "Walmart purchase added to inventory"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
