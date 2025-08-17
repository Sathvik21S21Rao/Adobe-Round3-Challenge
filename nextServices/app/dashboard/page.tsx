'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FolderPlus, Upload, Folder, FileText, LogOut } from 'lucide-react';

interface Folder {
  _id: string;
  name: string;
  description: string;
  createdAt: string;
  pdfCount: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
    loadFolders();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        router.push('/auth/login');
      }
    } catch (error) {
      router.push('/auth/login');
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const response = await fetch('/api/folders');
      if (response.ok) {
        const foldersData = await response.json();
        setFolders(foldersData);
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newFolderName,
          description: newFolderDescription,
        }),
      });

      if (response.ok) {
        setNewFolderName('');
        setNewFolderDescription('');
        setIsCreateDialogOpen(false);
        loadFolders();
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">PDF Analysis Dashboard</h1>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">Welcome, {user?.name}</span>
            <Button onClick={logout} variant="outline" size="sm">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold text-gray-900">Your Folders</h2>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <FolderPlus className="w-4 h-4 mr-2" />
                Create Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
                <DialogDescription>
                  Create a new folder to organize your PDF documents.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createFolder} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="folderName">Folder Name</Label>
                  <Input
                    id="folderName"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="folderDescription">Description (Optional)</Label>
                  <Input
                    id="folderDescription"
                    value={newFolderDescription}
                    onChange={(e) => setNewFolderDescription(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Create Folder
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {folders.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Folder className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No folders yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first folder to start organizing your PDF documents.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <FolderPlus className="w-4 h-4 mr-2" />
                Create Your First Folder
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {folders.map((folder) => (
              <Card key={folder._id} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Folder className="w-8 h-8 text-blue-600" />
                    <div>
                      <CardTitle className="text-lg">{folder.name}</CardTitle>
                      <CardDescription>{folder.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <FileText className="w-4 h-4" />
                      <span>{folder.pdfCount} PDFs</span>
                    </div>
                    <Button
                      onClick={() => router.push(`/folder/${folder._id}`)}
                      variant="outline"
                      size="sm"
                    >
                      Open
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
