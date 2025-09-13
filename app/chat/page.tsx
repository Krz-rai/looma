import SimpleChatbox from '@/app/components/SimpleChatbox';

export default function ChatPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="text-center py-4 border-b">
        <h1 className="text-2xl font-bold">AI Chat Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Chat with our AI assistant powered by Gemini 2.0 Flash
        </p>
      </div>
      
      <div className="flex-1">
        <SimpleChatbox />
      </div>
    </div>
  );
}
