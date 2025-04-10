
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
from typing import Any, Dict, Union, List
import sqlite3
import json
from neuro_san.interfaces.coded_tool import CodedTool


class VendorDatabaseTool(CodedTool):
    """
    CodedTool implementation for managing vendor data, including suppliers, 
    materials, reliability scores, lead times, and risk ratings.
    """

    def __init__(self):
        self.db_name = "vendor_database.db"
        self._initialize_database()
        self._populate_sample_data()

    def _initialize_database(self):
        """Create the vendor database schema if it doesn't exist."""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS vendors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    country TEXT,
                    materials TEXT,
                    reliability_score REAL,
                    lead_time_days INTEGER,
                    risk_rating TEXT
                )
            ''')
            conn.commit()

    def _populate_sample_data(self):
        """Insert default vendor data if the table is empty."""
        sample_vendors = [
            ("TSMC", "Taiwan", ["Silicon Wafers", "Chip Packaging"], 4.9, 30, "Low"),
            ("Samsung", "South Korea", ["Memory Chips", "Chip Fabrication"], 4.7, 45, "Moderate"),
            ("Intel", "USA", ["Processors", "Chipsets"], 4.6, 40, "Moderate"),
            ("SK Hynix", "South Korea", ["DRAM", "NAND Flash"], 4.5, 35, "Low"),
            ("Foxconn", "China", ["PCB Manufacturing", "Assembly"], 4.3, 50, "High")
        ]

        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM vendors")
            count = cursor.fetchone()[0]

            if count == 0:
                cursor.executemany('''
                    INSERT INTO vendors (name, country, materials, reliability_score, lead_time_days, risk_rating)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', [(name, country, json.dumps(materials), score, lead_time, risk)
                      for name, country, materials, score, lead_time, risk])
                conn.commit()

    def invoke(self, args: Dict[str, Any], sly_data: Dict[str, Any]) -> Union[Dict[str, Any], str]:
        """
        Processes vendor-related queries based on provided arguments.

        :param args: A dictionary containing:
            - "action": The operation to perform (add, get, update, delete, list).
            - "name" (optional): Vendor name.
            - "country" (optional): Country of origin.
            - "materials" (optional): List of materials supplied.
            - "reliability_score" (optional): Vendor's reliability score.
            - "lead_time_days" (optional): Lead time for shipments.
            - "risk_rating" (optional): Risk rating (e.g., Low, Moderate, High).

        :return: JSON-formatted response with vendor data or an error message.
        """
        action = args.get("action")

        if action == "add":
            return self.add_vendor(
                args.get("name"),
                args.get("country"),
                args.get("materials", []),
                args.get("reliability_score"),
                args.get("lead_time_days"),
                args.get("risk_rating")
            )

        elif action == "get":
            return self.get_vendor(args.get("name"))

        elif action == "update":
            return self.update_vendor(
                args.get("name"),
                args.get("reliability_score"),
                args.get("lead_time_days"),
                args.get("risk_rating")
            )

        elif action == "delete":
            return self.delete_vendor(args.get("name"))

        elif action == "list":
            return self.list_vendors()

        return "Error: Invalid action provided."

    def add_vendor(self, name: str, country: str, materials: List[str], 
                   reliability_score: float, lead_time_days: int, risk_rating: str) -> Dict[str, Any]:
        """Adds a new vendor to the database."""
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO vendors (name, country, materials, reliability_score, lead_time_days, risk_rating)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (name, country, json.dumps(materials), reliability_score, lead_time_days, risk_rating))
                conn.commit()
            return {"status": "success", "message": f"Vendor '{name}' added successfully."}
        except sqlite3.IntegrityError:
            return {"status": "error", "message": "Vendor already exists."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_vendor(self, name: str) -> Dict[str, Any]:
        """Retrieves a vendor's details by name."""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM vendors WHERE name = ?", (name,))
            row = cursor.fetchone()

            if row:
                return {
                    "status": "success",
                    "vendor": {
                        "id": row[0],
                        "name": row[1],
                        "country": row[2],
                        "materials": json.loads(row[3]),
                        "reliability_score": row[4],
                        "lead_time_days": row[5],
                        "risk_rating": row[6]
                    }
                }
            return {"status": "error", "message": "Vendor not found."}

    def update_vendor(self, name: str, reliability_score: float = None, 
                      lead_time_days: int = None, risk_rating: str = None) -> Dict[str, Any]:
        """Updates an existing vendor's details."""
        updates = []
        params = []
        if reliability_score is not None:
            updates.append("reliability_score = ?")
            params.append(reliability_score)
        if lead_time_days is not None:
            updates.append("lead_time_days = ?")
            params.append(lead_time_days)
        if risk_rating is not None:
            updates.append("risk_rating = ?")
            params.append(risk_rating)

        if not updates:
            return {"status": "error", "message": "No updates provided."}

        params.append(name)

        query = f"UPDATE vendors SET {', '.join(updates)} WHERE name = ?"
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()

        return {"status": "success", "message": f"Vendor '{name}' updated successfully."}

    def delete_vendor(self, name: str) -> Dict[str, Any]:
        """Deletes a vendor from the database."""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM vendors WHERE name = ?", (name,))
            conn.commit()

        return {"status": "success", "message": f"Vendor '{name}' deleted successfully."}

    def list_vendors(self) -> Dict[str, Any]:
        """Returns a list of all vendors in the database."""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM vendors")
            rows = cursor.fetchall()

            vendors = [
                {
                    "id": row[0],
                    "name": row[1],
                    "country": row[2],
                    "materials": json.loads(row[3]),
                    "reliability_score": row[4],
                    "lead_time_days": row[5],
                    "risk_rating": row[6]
                }
                for row in rows
            ]

        return {"status": "success", "vendors": vendors}
