/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `folder` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "folder_name_key" ON "folder"("name");
