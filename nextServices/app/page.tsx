'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            PDF Analysis Platform
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Upload, organize, and analyze your PDF documents with AI-powered heading detection and semantic similarity matching.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Get Started</CardTitle>
              <CardDescription>
                Sign in to access your document library and analysis tools.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => router.push('/auth/login')} 
                className="w-full"
              >
                Sign In
              </Button>
              <Button 
                onClick={() => router.push('/auth/register')} 
                variant="outline" 
                className="w-full"
              >
                Create Account
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Smart Organization</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Create folders and organize your PDFs with intelligent categorization.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI-Powered Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Automatic heading detection and semantic similarity matching across documents.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Advanced PDF Viewer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Adobe PDF Embed API integration with highlighting and navigation features.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
