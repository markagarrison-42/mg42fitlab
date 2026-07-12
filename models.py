from extensions import db
from flask_login import UserMixin
from datetime import datetime


class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    strength_logs = db.relationship("StrengthLog", backref="user", lazy=True, cascade="all, delete-orphan")
    rowing_logs = db.relationship("RowingLog", backref="user", lazy=True, cascade="all, delete-orphan")
    body_logs = db.relationship("BodyLog", backref="user", lazy=True, cascade="all, delete-orphan")
    nutrition_logs = db.relationship("NutritionLog", backref="user", lazy=True, cascade="all, delete-orphan")
    protocol_items = db.relationship("ProtocolItem", backref="user", lazy=True, cascade="all, delete-orphan")
    dose_logs = db.relationship("DoseLog", backref="user", lazy=True, cascade="all, delete-orphan")
    cardio_logs = db.relationship("CardioLog", backref="user", lazy=True, cascade="all, delete-orphan")
    recovery_logs = db.relationship("RecoveryLog", backref="user", lazy=True, cascade="all, delete-orphan")


class StrengthLog(db.Model):
    __tablename__ = "strength_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    exercise = db.Column(db.String(100), nullable=False)
    sets = db.Column(db.Integer, nullable=False, default=1)
    reps = db.Column(db.Integer, nullable=False)
    weight_lbs = db.Column(db.Float, nullable=False, default=0)
    rpe = db.Column(db.Float, nullable=True)
    source = db.Column(db.String(50), default="Manual")  # Manual, Strong, Apple Health
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def estimated_1rm(self):
        if self.reps and self.weight_lbs:
            return round(self.weight_lbs * (1 + self.reps / 30))
        return None

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "exercise": self.exercise,
            "sets": self.sets,
            "reps": self.reps,
            "weight_lbs": self.weight_lbs,
            "rpe": self.rpe,
            "estimated_1rm": self.estimated_1rm,
            "source": self.source,
            "notes": self.notes,
        }


class RowingLog(db.Model):
    __tablename__ = "rowing_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    session_type = db.Column(db.String(50), default="Steady state")
    distance_m = db.Column(db.Integer, nullable=True)
    duration = db.Column(db.String(20), nullable=True)   # mm:ss string
    split = db.Column(db.String(20), nullable=True)      # /500m as mm:ss.s
    stroke_rate = db.Column(db.Integer, nullable=True)
    avg_watts = db.Column(db.Integer, nullable=True)
    avg_hr = db.Column(db.Integer, nullable=True)
    source = db.Column(db.String(50), default="Manual")
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "session_type": self.session_type,
            "distance_m": self.distance_m,
            "duration": self.duration,
            "split": self.split,
            "stroke_rate": self.stroke_rate,
            "avg_watts": self.avg_watts,
            "avg_hr": self.avg_hr,
            "source": self.source,
            "notes": self.notes,
        }


class BodyLog(db.Model):
    __tablename__ = "body_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    weight_lbs = db.Column(db.Float, nullable=True)
    body_fat_pct = db.Column(db.Float, nullable=True)
    muscle_mass_lbs = db.Column(db.Float, nullable=True)
    source = db.Column(db.String(50), default="Manual")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def fat_mass_lbs(self):
        try:
            if self.weight_lbs and self.body_fat_pct:
                return round(float(self.weight_lbs) * float(self.body_fat_pct) / 100, 1)
        except (TypeError, ValueError):
            pass
        return None

    @property
    def lean_mass_lbs(self):
        try:
            if self.weight_lbs and self.fat_mass_lbs is not None:
                return round(float(self.weight_lbs) - float(self.fat_mass_lbs), 1)
        except (TypeError, ValueError):
            pass
        return None

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "weight_lbs": self.weight_lbs,
            "body_fat_pct": self.body_fat_pct,
            "muscle_mass_lbs": self.muscle_mass_lbs,
            "fat_mass_lbs": self.fat_mass_lbs,
            "lean_mass_lbs": self.lean_mass_lbs,
            "source": self.source,
        }


class NutritionLog(db.Model):
    __tablename__ = "nutrition_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    time = db.Column(db.String(10), nullable=True)       # HH:MM string
    food_source = db.Column(db.String(100), nullable=False)
    protein_g = db.Column(db.Float, nullable=False)
    calories = db.Column(db.Integer, nullable=True)
    notes = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "time": self.time,
            "food_source": self.food_source,
            "protein_g": self.protein_g,
            "calories": self.calories,
            "notes": self.notes,
        }


class ProtocolItem(db.Model):
    __tablename__ = "protocol_items"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)  # Peptide, Supplement, etc.
    dose = db.Column(db.String(50), nullable=True)
    frequency = db.Column(db.String(50), nullable=True)
    route = db.Column(db.String(50), nullable=True)      # Subcutaneous, Oral, etc.
    timing = db.Column(db.String(100), nullable=True)
    goal = db.Column(db.String(200), nullable=True)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "dose": self.dose,
            "frequency": self.frequency,
            "route": self.route,
            "timing": self.timing,
            "goal": self.goal,
            "active": self.active,
        }


class DoseLog(db.Model):
    __tablename__ = "dose_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    protocol_item_id = db.Column(db.Integer, db.ForeignKey("protocol_items.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    taken_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "protocol_item_id": self.protocol_item_id,
            "date": self.date.isoformat(),
            "taken_at": self.taken_at.isoformat(),
        }


class UserSettings(db.Model):
    __tablename__ = "user_settings"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    protein_goal_g = db.Column(db.Integer, default=200)
    bodyweight_lbs = db.Column(db.Float, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "protein_goal_g": self.protein_goal_g,
            "bodyweight_lbs": self.bodyweight_lbs,
        }
class CardioLog(db.Model):
    __tablename__ = "cardio_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    activity_type = db.Column(db.String(50), nullable=False)  # Running, Cycling, HIIT etc.
    duration_mins = db.Column(db.Float, nullable=True)
    distance_m = db.Column(db.Float, nullable=True)
    avg_hr = db.Column(db.Integer, nullable=True)
    max_hr = db.Column(db.Integer, nullable=True)
    calories = db.Column(db.Integer, nullable=True)
    avg_pace = db.Column(db.String(20), nullable=True)   # mm:ss per mile/km
    avg_speed = db.Column(db.Float, nullable=True)       # mph
    cadence = db.Column(db.Integer, nullable=True)
    source = db.Column(db.String(50), default="Manual")
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "activity_type": self.activity_type,
            "duration_mins": self.duration_mins,
            "distance_m": self.distance_m,
            "avg_hr": self.avg_hr,
            "max_hr": self.max_hr,
            "calories": self.calories,
            "avg_pace": self.avg_pace,
            "avg_speed": self.avg_speed,
            "cadence": self.cadence,
            "source": self.source,
            "notes": self.notes,
        }


class RecoveryLog(db.Model):
    __tablename__ = "recovery_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    resting_hr = db.Column(db.Integer, nullable=True)
    hrv = db.Column(db.Float, nullable=True)
    vo2_max = db.Column(db.Float, nullable=True)
    sleep_hrs = db.Column(db.Float, nullable=True)
    sleep_quality = db.Column(db.String(20), nullable=True)  # Deep, Core, REM, Awake
    steps = db.Column(db.Integer, nullable=True)
    active_calories = db.Column(db.Integer, nullable=True)
    source = db.Column(db.String(50), default="Apple Health")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "resting_hr": self.resting_hr,
            "hrv": self.hrv,
            "vo2_max": self.vo2_max,
            "sleep_hrs": self.sleep_hrs,
            "sleep_quality": self.sleep_quality,
            "steps": self.steps,
            "active_calories": self.active_calories,
            "source": self.source,
        }

class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.String(100), unique=True, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def is_valid(self):
        from datetime import datetime
        return not self.used and self.expires_at > datetime.utcnow()

    def to_dict(self):
        return {
            "token": self.token,
            "expires_at": self.expires_at.isoformat(),
            "used": self.used,
        }
