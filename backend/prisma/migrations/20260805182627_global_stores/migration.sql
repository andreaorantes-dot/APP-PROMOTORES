-- CreateTable
CREATE TABLE "Promoter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "supervisor" TEXT,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "VisitRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promoterId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkInTime" DATETIME,
    "checkInDistance" INTEGER,
    "checkOutTime" DATETIME,
    "checkOutDistance" INTEGER,
    "rollos" INTEGER NOT NULL DEFAULT 0,
    "cubetas" INTEGER NOT NULL DEFAULT 0,
    "photo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VisitRecord_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VisitRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VisitRecord_promoterId_day_idx" ON "VisitRecord"("promoterId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "VisitRecord_promoterId_storeId_day_key" ON "VisitRecord"("promoterId", "storeId", "day");
