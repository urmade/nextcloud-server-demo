export interface CollaborationResourceRef {
	type: string;
	id: string;
}

export interface CollaborationRichObject {
	type: string;
	id: string;
	name: string;
	link: string;
}

export interface CollaborationCollection {
	id: number;
	name: string;
	resources: CollaborationRichObject[];
}

export interface AddResourceRequest {
	resourceType: string;
	resourceId: string;
}

export interface RenameCollectionRequest {
	collectionName: string;
}

export interface CreateCollectionRequest {
	name: string;
}
